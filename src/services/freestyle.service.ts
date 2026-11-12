import path from "path";
import { parseBuffer } from "music-metadata";
import cloudinary, { cloudinaryConfigured } from "../config/cloudinary";
import { AUDIO_RULES, MIME_BY_EXTENSION } from "../config/audioRules";
import { FreestyleRecording } from "../models/FreestyleRecording";
import { Phrase } from "../models/Phrase";
import { ApiError } from "../utils/ApiError";
import { sanitizeFileName } from "../utils/audio";

export const FREESTYLE_PHRASE_COUNT = 15;

/* 15 random phrases, never ones the user already recorded (1 voice per phrase). */
export async function getRandomPhrases(userId: string, count = FREESTYLE_PHRASE_COUNT) {
  const done = await FreestyleRecording.find({ user: userId }).distinct("phrase");
  const phrases = await Phrase.aggregate<{ _id: unknown; text: string }>([
    { $match: { isActive: true, _id: { $nin: done } } },
    { $sample: { size: count } },
    { $project: { text: 1 } },
  ]);
  return {
    recordedCount: done.length,
    phrases: phrases.map((p) => ({ id: String(p._id), text: p.text })),
  };
}

function uploadBuffer(buffer: Buffer, publicId: string): Promise<{ publicId: string; format: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: "video", // Cloudinary stores audio as "video"
          type: "private",
          folder: "mother-tongue-contest/freestyle",
          public_id: publicId,
          overwrite: false,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error("Cloudinary did not return a result."));
          resolve({ publicId: result.public_id, format: result.format || "webm" });
        },
      )
      .end(buffer);
  });
}

interface CreateInput {
  userId: string;
  phraseId: string;
  file: Express.Multer.File;
  clientDuration?: number;
  angryStartSeconds?: number;
}

export async function createRecording({ userId, phraseId, file, clientDuration, angryStartSeconds }: CreateInput) {
  if (!cloudinaryConfigured) throw new ApiError(503, "Le stockage audio n'est pas configuré. Veuillez réessayer plus tard.");
  if (!file.buffer?.length) throw ApiError.badRequest("Le fichier audio est vide.");

  const phrase = await Phrase.findOne({ _id: phraseId, isActive: true }).select("_id").lean();
  if (!phrase) throw ApiError.notFound("Phrase introuvable.");
  if (await FreestyleRecording.exists({ user: userId, phrase: phraseId })) {
    throw ApiError.conflict("Vous avez déjà enregistré cette phrase.");
  }

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

  // Browser-recorded WebM may omit duration metadata: fall back to the client value.
  const duration = metadata.format.duration ?? (extension === ".webm" ? clientDuration ?? 0 : 0);
  // No minimum duration in freestyle, only a maximum.
  if (!Number.isFinite(duration) || duration <= 0) throw ApiError.unprocessable("Enregistrement vide ou illisible.");
  if (duration > AUDIO_RULES.maxDurationSeconds) throw ApiError.unprocessable("L'enregistrement ne doit pas dépasser 5 minutes.");

  const angry = angryStartSeconds !== undefined && angryStartSeconds <= duration ? Math.round(angryStartSeconds) : null;

  const publicId = `${userId}-${phraseId}-${Date.now()}`;
  let cloud: { publicId: string; format: string };
  try {
    cloud = await uploadBuffer(file.buffer, publicId);
  } catch (error) {
    console.error("Freestyle Cloudinary upload failed:", error);
    throw new ApiError(502, "L'envoi vers le stockage audio a échoué. Vérifiez votre connexion et réessayez.");
  }

  try {
    return await FreestyleRecording.create({
      user: userId,
      phrase: phraseId,
      fileName: sanitizeFileName(file.originalname),
      mimeType: trustedMime,
      sizeBytes: file.size,
      durationSeconds: Math.round(duration),
      angryStartSeconds: angry,
      cloudinaryPublicId: cloud.publicId,
      cloudinaryFormat: cloud.format,
    });
  } catch (error) {
    await cloudinary.uploader
      .destroy(cloud.publicId, { resource_type: "video", type: "private" })
      .catch((e: unknown) => console.error("Cloudinary cleanup failed:", e));
    // Two simultaneous uploads of the same phrase: the unique index rejects the second.
    if ((error as { code?: number }).code === 11000) throw ApiError.conflict("Vous avez déjà enregistré cette phrase.");
    throw error;
  }
}

export async function listMine(userId: string) {
  const items = await FreestyleRecording.find({ user: userId }).sort({ createdAt: -1 }).populate("phrase", "text").lean();
  return items.map((r) => ({
    id: String(r._id),
    createdAt: r.createdAt.toISOString(),
    durationSeconds: r.durationSeconds,
    angryStartSeconds: r.angryStartSeconds ?? null,
    phrase: { id: String((r.phrase as { _id: unknown })._id), text: (r.phrase as { text?: string }).text ?? "" },
  }));
}

/* Short-lived private URL. Only the owner or an admin can listen. */
export async function getAudioUrl(recordingId: string, requester: { id: string; role: string }) {
  const rec = await FreestyleRecording.findById(recordingId);
  if (!rec || (requester.role !== "admin" && String(rec.user) !== requester.id)) {
    throw ApiError.notFound("Enregistrement introuvable.");
  }
  const url = cloudinary.utils.private_download_url(rec.cloudinaryPublicId, rec.cloudinaryFormat, {
    resource_type: "video",
    type: "private",
    expires_at: Math.floor(Date.now() / 1000) + 600,
  });
  return { url };
}
