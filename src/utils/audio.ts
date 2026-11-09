import fs from "fs/promises";
import { parseFile } from "music-metadata";
import { ApiError } from "./ApiError";

/* =====================================================================
   AUDIO HELPERS
   ===================================================================== */

/* Deletes a file, ignoring errors (used to clean up rejected uploads). */
export const removeFile = async (filePath: string): Promise<void> => {
  await fs.unlink(filePath).catch(() => undefined);
};

/* Cleans the file name shown in tables: no folders, no control characters,
   max 120 characters. (React escapes text, this is extra protection.) */
export const sanitizeFileName = (originalName: string): string => {
  const baseName = originalName.split(/[\\/]/).pop() ?? "audio";
  // eslint-disable-next-line no-control-regex
  const cleaned = baseName.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return cleaned.slice(-120) || "audio";
};

/* Opens the saved file and checks it is REALLY audio (not a renamed
   .exe or .txt), then returns its duration in seconds.
   Browser recordings (.webm) often have no duration inside the file,
   so for those we fall back to the duration sent by the frontend. */
export async function inspectAudioFile(filePath: string, clientDuration?: number): Promise<number> {
  let duration: number | undefined;

  try {
    const metadata = await parseFile(filePath, { duration: true });
    if (!metadata.format.container) throw new Error("unknown container");
    duration = metadata.format.duration;
  } catch {
    throw ApiError.unprocessable("Fichier audio illisible ou invalide.");
  }

  if (!duration || !Number.isFinite(duration)) duration = clientDuration;

  if (!duration || !Number.isFinite(duration)) {
    throw ApiError.unprocessable("Impossible de déterminer la durée de l'audio.");
  }
  return duration;
}
