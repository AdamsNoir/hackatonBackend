import { z } from "zod";

/* POST /submissions - text fields sent next to the audio file. */
export const createSubmissionSchema = z.object({
  durationSeconds: z.coerce.number().positive().max(3600).optional(),
});

/* PATCH /submissions/:id/evaluate - jury decision. */
export const evaluateSubmissionSchema = z
  .object({
    status: z.enum(["evaluated", "rejected"]),
    score: z.number().min(0, "Le score minimum est 0.").max(100, "Le score maximum est 100.").optional(),
  })
  .refine((data) => data.status === "rejected" || data.score !== undefined, {
    message: "Un score (0-100) est requis pour valider une soumission.",
  });

/* GET /submissions (admin list) - filters and pagination. */
export const listSubmissionsQuerySchema = z.object({
  status: z.enum(["pending", "evaluated", "rejected"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type EvaluateSubmissionInput = z.infer<typeof evaluateSubmissionSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
