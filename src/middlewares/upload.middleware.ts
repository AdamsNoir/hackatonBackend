import crypto from "crypto";
import path from "path";
import multer from "multer";
import { AUDIO_RULES, AUDIO_UPLOAD_DIR, MIME_BY_EXTENSION } from "../config/audioRules";
import { ApiError } from "../utils/ApiError";
import { getRequestUser } from "./auth.middleware";

/* =====================================================================
   UPLOAD MIDDLEWARE (multer)
   - saves the file in uploads/audio with a random name
     (the name given by the user is NEVER used on disk)
   - accepts only audio extensions (mp3, wav, m4a, ogg, webm)
   - refuses files bigger than the limit
   The file arrives in the form field named "audio".
   Must be used AFTER requireAuth.
   ===================================================================== */
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, AUDIO_UPLOAD_DIR),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${getRequestUser(req).id}-${Date.now()}-${crypto.randomUUID()}${extension}`;
    callback(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: AUDIO_RULES.maxFileSizeMb * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const extensionOk = extension in MIME_BY_EXTENSION;
    const mimeOk = file.mimetype.startsWith("audio/") || file.mimetype === "application/ogg";

    if (!extensionOk || !mimeOk) {
      return callback(ApiError.badRequest("Format non supporté. Formats acceptés : mp3, wav, m4a, ogg."));
    }
    callback(null, true);
  },
});

export const uploadAudio = upload.single("audio");
