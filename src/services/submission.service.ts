import path from "path";
import { parseBuffer } from "music-metadata";
import cloudinary, { cloudinaryConfigured } from "../config/cloudinary";
import { AUDIO_RULES, MIME_BY_EXTENSION } from "../config/audioRules";
import { Submission, type SubmissionStatus } from "../models/Submission";
import { ApiError } from "../utils/ApiError";
import { sanitizeFileName } from "../utils/audio";
import type { ListSubmissionsQuery } from "../validators/submission.validator";

interface CreateSubmissionInput {
  userId: string;
  file: Express.Multer.File;
  clientDuration?: number;
}

function uploadBufferToCloudinary(buffer: Buffer, publicId: string): Promise<{ publicId: string; format: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        resource_type: "video", // Cloudinary stores audio using the video resource type.
        type: "private",
        folder: "mother-tongue-contest/submissions",
        public_id: publicId,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Cloudinary did not return an upload result."));
        resolve({ publicId: result.public_id, format: result.format || "webm" });
      },
    ).end(buffer);
  });
}

/** Uploads straight from the request buffer to Cloudinary; no local file or migration step. */
export async function createSubmission({ userId, file, clientDuration }: CreateSubmissionInput) {
  if (!cloudinaryConfigured) {
    throw new ApiError(503, "Le stockage audio n'est pas configuré. Veuillez réessayer plus tard.");
  }
  if (!file.buffer?.length) throw ApiError.badRequest("Le fichier audio est vide.");

  const extension = path.extname(file.originalname).toLowerCase();
  const trustedMime = MIME_BY_EXTENSION[extension];
  if (!trustedMime) throw ApiError.badRequest("Format audio non supporté.");

  let metadata: Awaited<ReturnType<typeof parseBuffer>>;
  try {
    metadata = await parseBuffer(file.buffer, { mimeType: trustedMime }, { duration: true });
  } catch {
    throw ApiError.unprocessable("Fichier audio illisible ou invalide.");
  }
  if (!metadata.format.container) throw ApiError.unprocessable("Fichier audio illisible ou invalide.");

  // Browser-recorded WebM may be valid but omit duration metadata.
  const duration = metadata.format.duration ?? (extension === ".webm" ? clientDuration ?? 0 : 0);

  if (!Number.isFinite(duration) || duration < AUDIO_RULES.minDurationSeconds) {
    throw ApiError.unprocessable("Recording must be at least 2 minutes long.");
  }
  if (duration > AUDIO_RULES.maxDurationSeconds) {
    throw ApiError.unprocessable("Recording must not exceed 5 minutes.");
  }

  // Upload first. A failed Cloudinary upload creates no dangling MongoDB record.
  const temporaryId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let cloud: { publicId: string; format: string };
  try {
    cloud = await uploadBufferToCloudinary(file.buffer, temporaryId);
  } catch (error) {
    console.error("Direct Cloudinary audio upload failed:", error);
    throw new ApiError(502, "L'envoi vers le stockage audio a échoué. Vérifiez votre connexion et réessayez.");
  }

  try {
    return await Submission.create({
      user: userId,
      fileName: sanitizeFileName(file.originalname),
      mimeType: trustedMime,
      sizeBytes: file.size,
      durationSeconds: Math.round(duration),
      storageStatus: "cloudinary",
      cloudinaryPublicId: cloud.publicId,
      cloudinaryFormat: cloud.format,
      migratedAt: new Date(),
    });
  } catch (error) {
    // Avoid leaving an unreferenced private recording if MongoDB rejects the record.
    await cloudinary.uploader.destroy(cloud.publicId, { resource_type: "video", type: "private" })
      .catch((cleanupError: unknown) => console.error("Cloudinary cleanup failed:", cleanupError));
    throw error;
  }
}

export const getSubmissionsByUser = (userId: string, limit = 100) =>
  Submission.find({ user: userId }).sort({ createdAt: -1 }).limit(limit);

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

export async function evaluateSubmission({ submissionId, evaluatorId, status, score }: EvaluateInput) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw ApiError.notFound("Soumission introuvable.");
  submission.status = status;
  submission.score = status === "evaluated" ? (score ?? null) : null;
  submission.evaluatedAt = new Date();
  submission.evaluatedBy = evaluatorId as never;
  await submission.save();
  return submission;
}

/** Only the owner or an admin can listen to a recording. */
export async function getAudioForUser(submissionId: string, requester: { id: string; role: string }) {
  const submission = await Submission.findById(submissionId);
  const allowed = submission && (requester.role === "admin" || String(submission.user) === requester.id);
  if (!submission || !allowed) throw ApiError.notFound("Soumission introuvable.");

  if (submission.cloudinaryPublicId && submission.cloudinaryFormat) {
    const audioUrl = cloudinary.utils.private_download_url(
      submission.cloudinaryPublicId,
      submission.cloudinaryFormat,
      { resource_type: "video", type: "private", expires_at: Math.floor(Date.now() / 1000) + 600 },
    );
    return { audioUrl, mimeType: submission.mimeType };
  }

  // Compatibility for old recordings uploaded before direct Cloudinary storage.
  if (submission.storedFileName) {
    return { filePath: path.resolve(process.cwd(), "uploads", "audio", path.basename(submission.storedFileName)), mimeType: submission.mimeType };
  }
  throw new ApiError(404, "Fichier audio introuvable.");
}

export async function getStats() {
  const grouped = await Submission.aggregate<{ _id: SubmissionStatus; count: number }>([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const byStatus = { pending: 0, evaluated: 0, rejected: 0 };
  for (const row of grouped) byStatus[row._id] = row.count;
  return { totalSubmissions: byStatus.pending + byStatus.evaluated + byStatus.rejected, byStatus };
}
