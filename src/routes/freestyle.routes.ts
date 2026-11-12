import { Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import * as freestyleController from "../controllers/freestyle.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { uploadAudio } from "../middlewares/upload.middleware";
import { validateParams, validateQuery } from "../middlewares/validate.middleware";
import { idParamsSchema } from "../validators/common.validator";
import { freestylePhrasesQuerySchema } from "../validators/freestyle.validator";

/* Routes under /api/freestyle. There is no quota (unlimited recordings), only an
   anti-spam limit per user that is far above normal use. */
const freestyleUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `fs:${req.user.id}` : ipKeyGenerator(req.ip ?? "")),
  handler: (_req, res) => {
    res.status(429).json({ message: "Trop d'envois. Réessayez dans une heure." });
  },
});

const router = Router();
router.get("/phrases", requireAuth, validateQuery(freestylePhrasesQuerySchema), freestyleController.getPhrases);
router.get("/mine", requireAuth, freestyleController.listMine);
router.post("/", requireAuth, freestyleUploadLimiter, uploadAudio, freestyleController.createRecording);
router.get("/:id/audio-url", requireAuth, validateParams(idParamsSchema), freestyleController.getAudioUrl);
export default router;
