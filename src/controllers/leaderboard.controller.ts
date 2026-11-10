import { z } from "zod";
import { CONTEST_LANGUAGES } from "../config/languages";
import * as leaderboardService from "../services/leaderboard.service";
import { asyncHandler } from "../utils/asyncHandler";

// GET /leaderboard?limit=50&language=Ewondo   (both optional, limit max 500)
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  language: z.enum(CONTEST_LANGUAGES).optional(), // ?language=Ewondo
});

export const getLeaderboard = asyncHandler(async (req, res) => {
  const { limit, language } = querySchema.parse(req.query);
  res.json(await leaderboardService.getLeaderboard(limit, language));
});
