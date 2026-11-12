import { z } from "zod";
import { objectIdSchema } from "./common.validator";

/* GET /freestyle/phrases?count=15 */
export const freestylePhrasesQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(15).default(15),
});

/* POST /freestyle - text fields sent next to the audio file. */
export const createFreestyleSchema = z.object({
  phraseId: objectIdSchema,
  durationSeconds: z.coerce.number().positive().max(3600).optional(),
  angryStartSeconds: z.coerce.number().min(0).max(3600).optional(),
});
