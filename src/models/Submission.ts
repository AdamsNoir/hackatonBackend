import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

export const SUBMISSION_STATUSES = ["pending", "evaluated", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/* The graded phrases this ONE voice answers (saved at upload time, so the
   mapping voice <-> phrases never changes even if the phrase pool does). */
const submittedPhraseSchema = new Schema(
  {
    phrase: { type: Schema.Types.ObjectId, ref: "Phrase", required: true },
    text: { type: String, required: true },
    category: { type: String, default: "general" },
  },
  { _id: false },
);

const submissionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileName: { type: String, required: true },
    // Optional only to remain compatible with submissions created by the old disk-upload flow.
    storedFileName: { type: String },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    storageStatus: { type: String, enum: ["local", "migrating", "cloudinary"], default: "cloudinary", index: true },
    cloudinaryPublicId: { type: String, default: null },
    cloudinaryFormat: { type: String, default: null },
    storageError: { type: String, default: null },
    migrationStartedAt: { type: Date, default: null },
    migratedAt: { type: Date, default: null },
    durationSeconds: { type: Number, required: true },
    // Empty for submissions made before this field existed (the export reconstructs them).
    phrases: { type: [submittedPhraseSchema], default: [] },
    status: { type: String, enum: SUBMISSION_STATUSES, default: "pending" },
    score: { type: Number, min: 0, max: 100, default: null },
    evaluatedAt: { type: Date },
    evaluatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

submissionSchema.index({ user: 1, createdAt: -1 });
submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ status: 1, score: -1 });

export type SubmissionDocument = HydratedDocument<InferSchemaType<typeof submissionSchema>>;
export const Submission = model("Submission", submissionSchema);
