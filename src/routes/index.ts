import { Router } from "express";
import authRoutes from "./auth.routes";
import exportRoutes from "./export.routes";
import freestyleRoutes from "./freestyle.routes";
import leaderboardRoutes from "./leaderboard.routes";
import phraseRoutes from "./phrase.routes";
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
router.use("/phrases", phraseRoutes);
router.use("/freestyle", freestyleRoutes);
router.use("/admin/export", exportRoutes);

export default router;
