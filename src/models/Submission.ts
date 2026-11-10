import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/* =====================================================================
   SUBMISSION MODEL
   One document = one voice file sent by a participant.
   Audio starts on disk and is archived to Cloudinary after evaluation.
   ===================================================================== */
export const SUBMISSION_STATUSES = ["pending", "evaluated", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const submissionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // ----- File details -----
    fileName: { type: String, required: true }, // cleaned name shown in the table
    storedFileName: { type: String, required: true }, // real name on disk (unique)
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    // Audio stays local until evaluation, then is migrated to Cloudinary.
    storageStatus: {
      type: String,
      enum: ["local", "migrating", "cloudinary"],
      default: "local",
      index: true,
    },
    cloudinaryPublicId: { type: String, default: null },
    cloudinaryFormat: { type: String, default: null },
    storageError: { type: String, default: null },
    migrationStartedAt: { type: Date, default: null },
    migratedAt: { type: Date, default: null },
    durationSeconds: { type: Number, required: true },

    // ----- Evaluation (filled by the jury) -----
    status: { type: String, enum: SUBMISSION_STATUSES, default: "pending" },
    score: { type: Number, min: 0, max: 100, default: null }, // null until evaluated
    evaluatedAt: { type: Date },
    evaluatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }, // adds createdAt and updatedAt
);

// Speeds up "my submissions", the admin list and the leaderboard
submissionSchema.index({ user: 1, createdAt: -1 });
submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ status: 1, score: -1 });

export type SubmissionDocument = HydratedDocument<InferSchemaType<typeof submissionSchema>>;
export const Submission = model("Submission", submissionSchema);
