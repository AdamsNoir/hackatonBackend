import { CONTEST_RULES } from "../config/security";
import { Submission } from "../models/Submission";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { getRequestUser } from "./auth.middleware";

/* Stops a participant who already reached the maximum number of
   submissions. Runs BEFORE the upload, so no file is written. */
export const checkSubmissionQuota = asyncHandler(async (req, _res, next) => {
  const user = getRequestUser(req);
  const count = await Submission.countDocuments({ user: user.id });

  if (count >= CONTEST_RULES.maxSubmissionsPerUser) {
    throw ApiError.forbidden(
      `Vous avez atteint la limite de ${CONTEST_RULES.maxSubmissionsPerUser} soumissions.`,
    );
  }
  next();
});
