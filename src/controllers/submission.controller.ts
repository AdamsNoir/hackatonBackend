import { getRequestUser } from "../middlewares/auth.middleware";
import { toAdminSubmissionDTO, toSubmissionDTO } from "../mappers/submission.mapper";
import * as submissionService from "../services/submission.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { removeFile } from "../utils/audio";
import { createSubmissionSchema } from "../validators/submission.validator";

/* =====================================================================
   SUBMISSION CONTROLLER
   Reads the request, calls the service, sends the response.
   ===================================================================== */

// POST /submissions  (multipart: "audio" file + "durationSeconds")
export const createSubmission = asyncHandler(async (req, res) => {
  const user = getRequestUser(req);
  if (!req.file) throw ApiError.badRequest("Aucun fichier audio reçu (champ « audio »).");

  try {
    const { durationSeconds } = createSubmissionSchema.parse(req.body);
    const submission = await submissionService.createSubmission({
      userId: user.id,
      file: req.file,
      clientDuration: durationSeconds,
    });
    res.status(201).json(toSubmissionDTO(submission));
  } catch (error) {
    await removeFile(req.file.path); // do not keep rejected files on disk
    throw error;
  }
});

// GET /submissions/mine
export const getMySubmissions = asyncHandler(async (req, res) => {
  const submissions = await submissionService.getSubmissionsByUser(getRequestUser(req).id);
  res.json(submissions.map(toSubmissionDTO));
});

// GET /submissions   (admin: all submissions, ?status=pending&page=1&limit=20)
export const listSubmissions = asyncHandler(async (req, res) => {
  const result = await submissionService.listSubmissions(req.query as never);
  res.json({ ...result, items: result.items.map(toAdminSubmissionDTO) });
});

// PATCH /submissions/:id/evaluate   (admin)
export const evaluateSubmission = asyncHandler(async (req, res) => {
  const submission = await submissionService.evaluateSubmission({
    submissionId: String(req.params.id),
    evaluatorId: getRequestUser(req).id,
    ...req.body,
  });
  res.json(toSubmissionDTO(submission));
});

// GET /submissions/:id/audio   (owner or admin) - streams the audio file
export const streamAudio = asyncHandler(async (req, res) => {
  const { filePath, mimeType } = await submissionService.getAudioForUser(
    String(req.params.id),
    getRequestUser(req),
  );

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "private, no-store"); // never cached by shared proxies
  res.sendFile(filePath, { headers: { "Content-Disposition": "inline" } }); // supports seeking (Range)
});

// GET /submissions/stats   (admin)
export const getStats = asyncHandler(async (_req, res) => {
  res.json(await submissionService.getStats());
});
