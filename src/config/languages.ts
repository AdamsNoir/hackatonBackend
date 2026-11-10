/* =====================================================================
   CONTEST LANGUAGES
   Business rule: ONE prize (100 000 FCFA) per language.
   This list MUST match the frontend (src/data/languages.ts, field "name").
   To add a language: add its name here AND in the frontend list.
   ===================================================================== */
export const CONTEST_LANGUAGES = [
  "Fulfulde", // Extrême-Nord & Nord
  "Lamnso", // Nord-Ouest
  "Bakweri", // Sud-Ouest
  "Makaa", // Est
  "Bamiléké", // Ouest
  "Duala", // Littoral
  "Bulu", // Sud
  "Ewondo", // Centre
  "Gbaya", // Adamaoua
] as const;

export type ContestLanguage = (typeof CONTEST_LANGUAGES)[number];

export const PRIZE_PER_LANGUAGE_FCFA = 100_000;
