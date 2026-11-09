import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

/* =====================================================================
   USER MODEL
   ===================================================================== */
export const USER_ROLES = ["participant", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true }, // stored as +237XXXXXXXXX
    passwordHash: { type: String, required: true, select: false }, // never returned by default
    avatarUrl: { type: String },
    language: { type: String, trim: true, maxlength: 60 }, // mother tongue (shown in the leaderboard)
    role: { type: String, enum: USER_ROLES, default: "participant" },

    // ----- Security fields -----
    isActive: { type: Boolean, default: true }, // false = account disabled
    tokenVersion: { type: Number, default: 0 }, // +1 invalidates all old login tokens
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date }, // account locked until this date
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type UserAttributes = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserAttributes>;
export const User = model("User", userSchema);
