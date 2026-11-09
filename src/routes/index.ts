import { Router } from "express";
import authRoutes from "./auth.routes";
import leaderboardRoutes from "./leaderboard.routes";
import submissionRoutes from "./submission.routes";
import userRoutes from "./user.routes";

/* =====================================================================
   ROUTES INDEX - every route of the API is plugged in here.
   ===================================================================== */
const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/submissions", submissionRoutes);
router.use("/leaderboard", leaderboardRoutes);

export default router;
