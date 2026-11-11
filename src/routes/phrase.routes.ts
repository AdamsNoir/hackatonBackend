import { Router } from "express";
import * as phraseController from "../controllers/phrase.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { validateBody, validateQuery } from "../middlewares/validate.middleware";
import { createPhrasesSchema, listPhrasesQuerySchema } from "../validators/phrase.validator";

/* Routes under /api/phrases */
const router = Router();

router.get("/", requireAuth, validateQuery(listPhrasesQuerySchema), phraseController.listPhrases);
router.post("/", requireAuth, requireRole("admin"), validateBody(createPhrasesSchema), phraseController.createPhrases);

export default router;
