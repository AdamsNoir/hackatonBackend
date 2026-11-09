import path from "path";
import { AUDIO_RULES, AUDIO_UPLOAD_DIR, MIME_BY_EXTENSION } from "../config/audioRules";
import { Submission, type SubmissionStatus } from "../models/Submission";
import { ApiError } from "../utils/ApiError";
import { inspectAudioFile, sanitizeFileName } from "../utils/audio";
import type { ListSubmissionsQuery } from "../validators/submission.validator";

/* =====================================================================
   SUBMISSION SERVICE
   All the business logic for voice submissions lives here
   (controllers only handle the request/response).
   ===================================================================== */

interface CreateSubmissionInput {
  userId: string;
  file: Express.Multer.File; // the file already saved on disk by multer
  clientDuration?: number; // duration sent by the browser (fallback only)
}

/* Checks the saved audio, then stores its details in MongoDB. */
export async function createSubmission({ userId, file, clientDuration }: CreateSubmissionInput) {
  // 1. Check it is a real audio file and read its REAL duration
  const duration = await inspectAudioFile(file.path, clientDuration);
  const tolerance = AUDIO_RULES.durationToleranceSeconds;

  if (duration + tolerance < AUDIO_RULES.minDurationSeconds) {
    throw ApiError.unprocessable(`Durée minimale : ${AUDIO_RULES.minDurationSeconds / 60} minutes.`);
  }
  if (duration - tolerance > AUDIO_RULES.maxDurationSeconds) {
    throw ApiError.unprocessable(`Durée maximale : ${AUDIO_RULES.maxDurationSeconds / 60} minutes.`);
  }

  // 2. Save in MongoDB (status "pending" until the jury evaluates it)
  const extension = path.extname(file.filename).toLowerCase();
  return Submission.create({
    user: userId,
    fileName: sanitizeFileName(file.originalname),
    storedFileName: file.filename,
    mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream", // trusted type, not the browser's
    sizeBytes: file.size,
    durationSeconds: Math.round(duration),
  });
}

/* Submissions of one user, newest first ("Mes soumissions" table). */
export const getSubmissionsByUser = (userId: string, limit = 100) =>
  Submission.find({ user: userId }).sort({ createdAt: -1 }).limit(limit);

/* Admin list with filter by status and pagination. */
export async function listSubmissions({ status, page, limit }: ListSubmissionsQuery) {
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "fullName email"),
    Submission.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.max(Math.ceil(total / limit), 1) };
}

interface EvaluateInput {
  submissionId: string;
  evaluatorId: string;
  status: "evaluated" | "rejected";
  score?: number;
}

/* Used by the jury/admin to give a score (this feeds the leaderboard). */
export async function evaluateSubmission({ submissionId, evaluatorId, status, score }: EvaluateInput) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw ApiError.notFound("Soumission introuvable.");

  submission.status = status;
  submission.score = status === "evaluated" ? (score ?? null) : null;
  submission.evaluatedAt = new Date();
  submission.evaluatedBy = evaluatorId as never; // string id is cast to ObjectId by mongoose
  await submission.save();
  return submission;
}

/* Finds the audio file of a submission.
   Only its owner or an admin can listen to it. For anyone else we answer
   "not found" (we do not even confirm that the submission exists). */
export async function getAudioForUser(submissionId: string, requester: { id: string; role: string }) {
  const submission = await Submission.findById(submissionId);
  const allowed = submission && (requester.role === "admin" || String(submission.user) === requester.id);
  if (!submission || !allowed) throw ApiError.notFound("Soumission introuvable.");

  return {
    // path.basename = protection against path traversal ("../../etc/passwd")
    filePath: path.join(AUDIO_UPLOAD_DIR, path.basename(submission.storedFileName)),
    mimeType: submission.mimeType,
  };
}

/* Numbers for the admin dashboard. */
export async function getStats() {
  const grouped = await Submission.aggregate<{ _id: SubmissionStatus; count: number }>([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const byStatus = { pending: 0, evaluated: 0, rejected: 0 };
  for (const row of grouped) byStatus[row._id] = row.count;
  return { totalSubmissions: byStatus.pending + byStatus.evaluated + byStatus.rejected, byStatus };
}
