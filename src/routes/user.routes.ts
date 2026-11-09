import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { updateProfileSchema } from "../validators/user.validator";

/* Routes under /api/users */
const router = Router();

router.patch("/me", requireAuth, validateBody(updateProfileSchema), userController.updateMyProfile);

export default router;
