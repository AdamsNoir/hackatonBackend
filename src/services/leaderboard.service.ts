import { Submission } from "../models/Submission";
import { User } from "../models/User";
import { toLeaderboardEntryDTO, type LeaderboardRow } from "../mappers/leaderboard.mapper";

/* =====================================================================
   LEADERBOARD SERVICE
   Builds the ranking in ONE MongoDB aggregation:
     1. group the submissions by participant
     2. keep each participant's BEST evaluated score
     3. attach name / avatar / language from the users collection
     4. sort: highest score first (ties: who submitted first wins)
   One prize per language: ask ?language=Ewondo to get the ranking (and
   the winner = first row) of a single language.

   Want another rule? Change the "score" line in the $group stage:
     best score  -> $max (current)
     total score -> $sum
     average     -> $avg
   ===================================================================== */
export async function getLeaderboard(limit = 100, language?: string) {
  const rows = await Submission.aggregate<LeaderboardRow>([
    {
      $group: {
        _id: "$user",
        submissionsCount: { $sum: 1 },
        // Only evaluated submissions count for the score ($max ignores null)
        score: { $max: { $cond: [{ $eq: ["$status", "evaluated"] }, "$score", null] } },
        firstSubmissionAt: { $min: "$createdAt" },
      },
    },
    { $match: { score: { $ne: null } } }, // hide people with no evaluated score yet
    { $lookup: { from: User.collection.name, localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    // Optional filter: only one language (the ranking is then "inside" that language)
    ...(language ? [{ $match: { "user.language": language } }] : []),
    { $sort: { score: -1, firstSubmissionAt: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        fullName: "$user.fullName",
        avatarUrl: "$user.avatarUrl",
        language: "$user.language",
        submissionsCount: 1,
        score: 1,
      },
    },
  ]);

  return rows.map(toLeaderboardEntryDTO);
}
