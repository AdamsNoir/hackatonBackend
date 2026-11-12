import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

/* =====================================================================
   FREESTYLE RECORDING MODEL
   One document = one voice recording of ONE phrase by ONE user.
   The recording holds the phrase said in a normal tone, then (optionally)
   again in a mad tone. "angryStartSeconds" marks where the mad tone begins.
   Unique index (user, phrase) = a single voice per phrase.
   ===================================================================== */
const freestyleRecordingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    phrase: { type: Schema.Types.ObjectId, ref: "Phrase", required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    angryStartSeconds: { type: Number, min: 0, default: null }, // null = no mad tone marked
    cloudinaryPublicId: { type: String, required: true },
    cloudinaryFormat: { type: String, required: true },
  },
  { timestamps: true },
);

freestyleRecordingSchema.index({ user: 1, phrase: 1 }, { unique: true });

export type FreestyleRecordingDocument = HydratedDocument<InferSchemaType<typeof freestyleRecordingSchema>>;
export const FreestyleRecording = model("FreestyleRecording", freestyleRecordingSchema);
