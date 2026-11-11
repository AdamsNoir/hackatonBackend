import { Router } from "express";
import * as submissionController from "../controllers/submission.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { uploadLimiter } from "../middlewares/rateLimit.middleware";
import { checkSubmissionQuota } from "../middlewares/submissionQuota.middleware";
import { uploadAudio } from "../middlewares/upload.middleware";
import { validateBody, validateParams, validateQuery } from "../middlewares/validate.middleware";
import { idParamsSchema } from "../validators/common.validator";
import { evaluateSubmissionSchema, listSubmissionsQuerySchema } from "../validators/submission.validator";

const router = Router();
router.post("/", requireAuth, uploadLimiter, checkSubmissionQuota, uploadAudio, submissionController.createSubmission);
router.get("/mine", requireAuth, submissionController.getMySubmissions);
router.get("/stats", requireAuth, requireRole("admin"), submissionController.getStats);
router.get("/", requireAuth, requireRole("admin"), validateQuery(listSubmissionsQuerySchema), submissionController.listSubmissions);
router.patch("/:id/evaluate", requireAuth, requireRole("admin"), validateParams(idParamsSchema), validateBody(evaluateSubmissionSchema), submissionController.evaluateSubmission);
router.get("/:id/audio", requireAuth, validateParams(idParamsSchema), submissionController.streamAudio);
export default router;
