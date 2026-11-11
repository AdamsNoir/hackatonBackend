import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

export const SUBMISSION_STATUSES = ["pending", "evaluated", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

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
