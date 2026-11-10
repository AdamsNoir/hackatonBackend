import fs from "fs";
import path from "path";
import { env } from "./env";

/* =====================================================================
   AUDIO RULES
   Keep these numbers identical to the frontend recording rules.
   ===================================================================== */
export const AUDIO_RULES = {
  maxFileSizeMb: 15,
  minDurationSeconds: 2 * 60, // 2 minutes
  maxDurationSeconds: 5 * 60, // 5 minutes
  durationToleranceSeconds: 0, // enforce the exact 2–5 minute limits
} as const;

/* Allowed extensions and the content type we trust for each.
   SECURITY: we never trust the type sent by the browser. */
export const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm", // recordings made in the browser
};

/* Folder where voice files are saved (created automatically).
   It is NOT served publicly: files are only sent through an
   authenticated route (GET /api/submissions/:id/audio). */
export const AUDIO_UPLOAD_DIR = path.resolve(process.cwd(), env.UPLOAD_DIR, "audio");
fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true, mode: 0o750 });
