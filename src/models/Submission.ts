import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/* =====================================================================
   SUBMISSION MODEL
   One document = one voice file sent by a participant.
   The audio itself stays on disk; MongoDB keeps its details.
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
