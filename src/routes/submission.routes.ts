import { Router } from "express";
import * as submissionController from "../controllers/submission.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { uploadLimiter } from "../middlewares/rateLimit.middleware";
import { checkSubmissionQuota } from "../middlewares/submissionQuota.middleware";
import { uploadAudio } from "../middlewares/upload.middleware";
import { validateBody, validateParams, validateQuery } from "../middlewares/validate.middleware";
import { idParamsSchema } from "../validators/common.validator";
import { evaluateSubmissionSchema, listSubmissionsQuerySchema } from "../validators/submission.validator";

/* Routes under /api/submissions */
const router = Router();

// Upload: login -> rate limit -> quota -> file upload -> controller (order matters!)
router.post("/", requireAuth, uploadLimiter, checkSubmissionQuota, uploadAudio, submissionController.createSubmission);

// Participant
router.get("/mine", requireAuth, submissionController.getMySubmissions);

// Admin (jury)
router.get("/stats", requireAuth, requireRole("admin"), submissionController.getStats);
router.get("/", requireAuth, requireRole("admin"), validateQuery(listSubmissionsQuerySchema), submissionController.listSubmissions);
router.post(
  "/:id/migrate",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamsSchema),
  submissionController.retryAudioMigration,
);
router.patch(
  "/:id/evaluate",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamsSchema),
  validateBody(evaluateSubmissionSchema),
  submissionController.evaluateSubmission,
);

// Owner or admin
router.get("/:id/audio", requireAuth, validateParams(idParamsSchema), submissionController.streamAudio);

export default router;
