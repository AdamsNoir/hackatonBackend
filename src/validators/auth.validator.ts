import { z } from "zod";
import { CONTEST_LANGUAGES } from "../config/languages";
import { isCameroonPhone } from "../utils/phone";

/* =====================================================================
   AUTH VALIDATORS
   Define exactly what the frontend is allowed to send.
   Unknown fields are removed, wrong types are refused.
   (z.string() also blocks NoSQL injection like { "$gt": "" }.)
   ===================================================================== */

/* Password rules: 8-72 characters (72 = bcrypt limit), letters AND numbers. */
export const passwordSchema = z
  .string({ required_error: "Le mot de passe est requis." })
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(72, "Le mot de passe ne doit pas dépasser 72 caractères.")
  .regex(/[A-Za-z]/, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre.");

export const fullNameSchema = z
  .string({ required_error: "Le nom complet est requis." })
  .trim()
  .min(3, "Entrez votre nom complet.")
  .max(100, "Le nom est trop long.")
  .refine((value) => value.split(/\s+/).length >= 2, "Entrez votre prénom et votre nom.");

export const phoneSchema = z
  .string({ required_error: "Le téléphone est requis." })
  .refine(isCameroonPhone, "Numéro invalide. Exemple : 6 77 12 34 56");

/* Must be one of the contest languages (config/languages.ts). */
export const languageSchema = z.enum(CONTEST_LANGUAGES, {
  errorMap: () => ({ message: "Choisissez l'une des langues du concours." }),
});

export const registerSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: z.string({ required_error: "L'email est requis." }).trim().toLowerCase().email("Adresse email invalide.").max(254),
  password: passwordSchema,
  language: languageSchema, // mother tongue represented (one prize per language)
});

export const loginSchema = z.object({
  identifier: z.string({ required_error: "Identifiant requis." }).trim().min(1, "Identifiant requis.").max(254),
  password: z.string({ required_error: "Mot de passe requis." }).min(1, "Mot de passe requis.").max(72),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis.").max(72),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
