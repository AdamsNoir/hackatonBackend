import { z } from "zod";
import * as leaderboardService from "../services/leaderboard.service";
import { asyncHandler } from "../utils/asyncHandler";

// GET /leaderboard?limit=50   (limit is optional, max 500)
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const getLeaderboard = asyncHandler(async (req, res) => {
  const { limit } = querySchema.parse(req.query);
  res.json(await leaderboardService.getLeaderboard(limit));
});
