import { z } from "zod";
import { fullNameSchema, languageSchema, phoneSchema } from "./auth.validator";

/* PATCH /users/me - every field is optional, at least one is required. */
export const updateProfileSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    phone: phoneSchema.optional(),
    language: languageSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Aucune information à modifier.");

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
