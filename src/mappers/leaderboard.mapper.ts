import type { Types } from "mongoose";

/* =====================================================================
   LEADERBOARD MAPPER
   Raw MongoDB aggregation row -> the frontend "LeaderboardEntry".
   ===================================================================== */
export interface LeaderboardRow {
  userId: Types.ObjectId;
  fullName: string;
  avatarUrl?: string;
  language?: string;
  submissionsCount: number;
  score: number;
}

export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  fullName: string;
  avatarUrl?: string;
  language?: string;
  submissionsCount: number;
  score: number;
}

/* "index" is the position in the sorted list: position 0 -> rank 1. */
export const toLeaderboardEntryDTO = (row: LeaderboardRow, index: number): LeaderboardEntryDTO => ({
  rank: index + 1,
  userId: String(row.userId),
  fullName: row.fullName,
  avatarUrl: row.avatarUrl,
  language: row.language,
  submissionsCount: row.submissionsCount,
  score: row.score,
});
