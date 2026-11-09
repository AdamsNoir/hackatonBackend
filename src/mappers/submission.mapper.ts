import type { SubmissionDocument } from "../models/Submission";

/* =====================================================================
   SUBMISSION MAPPERS
   Convert MongoDB documents into the JSON the frontend expects.
   Internal fields (disk name, ...) are NOT exposed.
   ===================================================================== */
export interface SubmissionDTO {
  id: string;
  createdAt: string;
  fileName: string;
  status: "pending" | "evaluated" | "rejected";
  score: number | null;
}

export const toSubmissionDTO = (submission: SubmissionDocument): SubmissionDTO => ({
  id: submission.id,
  createdAt: submission.createdAt.toISOString(),
  fileName: submission.fileName,
  status: submission.status as SubmissionDTO["status"],
  score: submission.score ?? null,
});

/* Version for the jury/admin: adds participant, duration and size. */
export interface AdminSubmissionDTO extends SubmissionDTO {
  durationSeconds: number;
  sizeBytes: number;
  participant: { id: string; fullName: string; email: string } | null;
}

interface PopulatedUser {
  _id: { toString(): string };
  fullName: string;
  email: string;
}

export const toAdminSubmissionDTO = (submission: SubmissionDocument): AdminSubmissionDTO => {
  const participant = submission.user as unknown as PopulatedUser | null;
  return {
    ...toSubmissionDTO(submission),
    durationSeconds: submission.durationSeconds,
    sizeBytes: submission.sizeBytes,
    participant: participant?.fullName
      ? { id: participant._id.toString(), fullName: participant.fullName, email: participant.email }
      : null,
  };
};
