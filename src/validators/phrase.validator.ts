import { z } from "zod";

/* GET /phrases?page=1  (page 1 = the 5 graded phrases, next pages = practice) */
export const listPhrasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(20).default(1),
});

/* POST /phrases (admin) - append French phrases to the pool. */
export const createPhrasesSchema = z.object({
  phrases: z
    .array(z.object({ text: z.string().trim().min(1).max(300), category: z.string().trim().max(40).optional() }))
    .min(1)
    .max(200),
});

export type ListPhrasesQuery = z.infer<typeof listPhrasesQuerySchema>;
export type CreatePhrasesInput = z.infer<typeof createPhrasesSchema>;
