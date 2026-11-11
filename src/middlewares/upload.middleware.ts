import path from "path";
import multer from "multer";
import { AUDIO_RULES, MIME_BY_EXTENSION } from "../config/audioRules";
import { ApiError } from "../utils/ApiError";

// Keep the upload in memory only long enough to stream it to Cloudinary.
// This avoids writing a temporary file and then migrating it in a second step.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_RULES.maxFileSizeMb * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const extensionOk = extension in MIME_BY_EXTENSION;
    const mimeOk = file.mimetype.startsWith("audio/") || file.mimetype === "application/ogg";
    if (!extensionOk || !mimeOk) {
      return callback(ApiError.badRequest("Format non supporté. Formats acceptés : mp3, wav, m4a, ogg, webm."));
    }
    callback(null, true);
  },
});

export const uploadAudio = upload.single("audio");
