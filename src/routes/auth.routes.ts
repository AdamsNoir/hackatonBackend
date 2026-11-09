import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { loginLimiter, registerLimiter } from "../middlewares/rateLimit.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { changePasswordSchema, loginSchema, registerSchema } from "../validators/auth.validator";

/* Routes under /api/auth */
const router = Router();

router.post("/register", registerLimiter, validateBody(registerSchema), authController.register);
router.post("/login", loginLimiter, validateBody(loginSchema), authController.login);
router.get("/me", requireAuth, authController.me);
router.post("/change-password", requireAuth, validateBody(changePasswordSchema), authController.changePassword);
router.post("/logout", requireAuth, authController.logout);

export default router;
