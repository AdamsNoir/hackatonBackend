import path from "path";
import fs from "fs/promises";
import cloudinary, { cloudinaryConfigured } from "../config/cloudinary";
import { AUDIO_RULES, AUDIO_UPLOAD_DIR, MIME_BY_EXTENSION } from "../config/audioRules";
import { Submission, type SubmissionStatus } from "../models/Submission";
import { ApiError } from "../utils/ApiError";
import { inspectAudioFile, removeFile, sanitizeFileName } from "../utils/audio";
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

  // Evaluation/rejection completes the recording's local processing stage.
  // Migration failures are recorded but do not undo the jury's evaluation.
  await migrateSubmissionAudio(submission.id);
  return (await Submission.findById(submission.id)) ?? submission;
}

/**
 * Move one completed recording from local disk to Cloudinary.
 * Safe to retry: a MongoDB lock prevents two requests uploading the same file.
 * The local file is removed only after Cloudinary and MongoDB both succeed.
 */
export async function migrateSubmissionAudio(submissionId: string) {
  if (!cloudinaryConfigured) {
    console.warn("Cloudinary is not configured; audio migration was skipped.");
    return Submission.findById(submissionId);
  }

  // Recover a migration lock left behind if the server crashed mid-transfer.
  const staleLockBefore = new Date(Date.now() - 15 * 60 * 1000);
  const submission = await Submission.findOneAndUpdate(
    {
      _id: submissionId,
      status: { $in: ["evaluated", "rejected"] },
      $or: [
        { storageStatus: "local" },
        { storageStatus: { $exists: false } }, // submissions created before this feature
        { storageStatus: "migrating", migrationStartedAt: { $lt: staleLockBefore } },
      ],
    },
    { $set: { storageStatus: "migrating", storageError: null, migrationStartedAt: new Date() } },
    { new: true },
  );

  // Already migrated, not yet evaluated, or another request is migrating it.
  if (!submission) return Submission.findById(submissionId);

  const localPath = path.join(AUDIO_UPLOAD_DIR, path.basename(submission.storedFileName));
  let uploadedPublicId: string | undefined;

  try {
    await fs.access(localPath);

    const uploadResult = await cloudinary.uploader.upload(localPath, {
      resource_type: "video", // Cloudinary uses video resource_type for audio files.
      type: "private",
      folder: "mother-tongue-contest/submissions",
      public_id: submission.id,
      overwrite: true,
    });
    uploadedPublicId = uploadResult.public_id;

    // Register the cloud copy before deleting the only local copy.
    submission.cloudinaryPublicId = uploadResult.public_id;
    submission.cloudinaryFormat = uploadResult.format || path.extname(submission.storedFileName).slice(1);
    submission.storageStatus = "cloudinary";
    submission.storageError = null;
    submission.migrationStartedAt = null;
    submission.migratedAt = new Date();
    await submission.save();

    await removeFile(localPath);
    return submission;
  } catch (error) {
    // If the cloud upload succeeded but MongoDB could not be updated, remove
    // the unreferenced cloud copy and retain the original local file.
    if (uploadedPublicId) {
      await cloudinary.uploader.destroy(uploadedPublicId, {
        resource_type: "video",
        type: "private",
      }).catch((cleanupError: unknown) => console.error("Cloudinary rollback failed:", cleanupError));
    }

    const message = error instanceof Error ? error.message : "Unknown migration error";
    await Submission.updateOne(
      { _id: submissionId, storageStatus: "migrating" },
      { $set: { storageStatus: "local", storageError: message.slice(0, 500), migrationStartedAt: null } },
    );
    console.error(`Audio migration failed for submission ${submissionId}:`, error);
    return Submission.findById(submissionId);
  }
}

/* Finds the audio file of a submission.
   Only its owner or an admin can listen to it. For anyone else we answer
   "not found" (we do not even confirm that the submission exists). */
export async function getAudioForUser(submissionId: string, requester: { id: string; role: string }) {
  const submission = await Submission.findById(submissionId);
  const allowed = submission && (requester.role === "admin" || String(submission.user) === requester.id);
  if (!submission || !allowed) throw ApiError.notFound("Soumission introuvable.");

  if (submission.storageStatus === "cloudinary" && submission.cloudinaryPublicId && submission.cloudinaryFormat) {
    const audioUrl = cloudinary.utils.private_download_url(
      submission.cloudinaryPublicId,
      submission.cloudinaryFormat,
      {
        resource_type: "video",
        type: "private",
        expires_at: Math.floor(Date.now() / 1000) + 600,
      },
    );
    return { audioUrl, mimeType: submission.mimeType };
  }

  // Local file remains the playback source until migration succeeds.
  return {
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
