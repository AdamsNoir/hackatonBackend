import { Readable } from "stream";
import { getRequestUser } from "../middlewares/auth.middleware";
import { toAdminSubmissionDTO, toSubmissionDTO } from "../mappers/submission.mapper";
import * as submissionService from "../services/submission.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { createSubmissionSchema } from "../validators/submission.validator";

export const createSubmission = asyncHandler(async (req, res) => {
  const user = getRequestUser(req);
  if (!req.file) throw ApiError.badRequest("Aucun fichier audio reçu (champ « audio »).");
  const { durationSeconds } = createSubmissionSchema.parse(req.body);
  const submission = await submissionService.createSubmission({
    userId: user.id,
    file: req.file,
    clientDuration: durationSeconds,
  });
  res.status(201).json(toSubmissionDTO(submission));
});

export const getMySubmissions = asyncHandler(async (req, res) => {
  const submissions = await submissionService.getSubmissionsByUser(getRequestUser(req).id);
  res.json(submissions.map(toSubmissionDTO));
});

export const listSubmissions = asyncHandler(async (req, res) => {
  const result = await submissionService.listSubmissions(req.query as never);
  res.json({ ...result, items: result.items.map(toAdminSubmissionDTO) });
});

export const evaluateSubmission = asyncHandler(async (req, res) => {
  const submission = await submissionService.evaluateSubmission({
    submissionId: String(req.params.id),
    evaluatorId: getRequestUser(req).id,
    ...req.body,
  });
  res.json(toSubmissionDTO(submission));
});

export const streamAudio = asyncHandler(async (req, res) => {
  const audio = await submissionService.getAudioForUser(String(req.params.id), getRequestUser(req));
  res.setHeader("Cache-Control", "private, no-store");
  if ("audioUrl" in audio) {
    if (!audio.audioUrl) {
      throw new ApiError(
        502,
        "Unable to generate the Cloudinary audio URL."
      );
    }

    const upstream = await fetch(audio.audioUrl, {
      headers: req.headers.range
        ? { Range: req.headers.range }
        : undefined,
    });
    if (!upstream.ok || !upstream.body) {
      // Log the real Cloudinary answer so the cause is visible in the server logs
      const detail = await upstream.text().catch(() => "");
      console.error(`Cloudinary audio fetch failed (${upstream.status}) for submission ${String(req.params.id)}:`, detail.slice(0, 300));
      throw new ApiError(502, `Impossible de récupérer l'audio depuis le stockage cloud (Cloudinary ${upstream.status}).`);
    }
    res.status(upstream.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", audio.mimeType);
    for (const header of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    return Readable.fromWeb(upstream.body as import("stream/web").ReadableStream).pipe(res);
  }
  res.setHeader("Content-Type", audio.mimeType);
  res.sendFile(audio.filePath, { headers: { "Content-Disposition": "inline" } });
});

export const getStats = asyncHandler(async (_req, res) => {
  res.json(await submissionService.getStats());
});
