import { Router } from "express";
import * as leaderboardController from "../controllers/leaderboard.controller";
import { requireAuth } from "../middlewares/auth.middleware";

/* Routes under /api/leaderboard */
const router = Router();

router.get("/", requireAuth, leaderboardController.getLeaderboard);

export default router;
