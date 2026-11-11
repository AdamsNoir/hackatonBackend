import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

/* =====================================================================
   PHRASE MODEL
   One document = one French sentence that participants say aloud IN THEIR
   OWN MOTHER TONGUE. The pool holds 200 phrases (data/phrases.fr.ts).
   "order" decides who sees what: order 1-5 are the graded phrases.
   ===================================================================== */
const phraseSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 300, unique: true }, // French source
    category: { type: String, trim: true, maxlength: 40, default: "general" },
    order: { type: Number, required: true, index: true },
    isActive: { type: Boolean, default: true }, // false = hidden from participants
  },
  { timestamps: true },
);

export type PhraseDocument = HydratedDocument<InferSchemaType<typeof phraseSchema>>;
export const Phrase = model("Phrase", phraseSchema);
