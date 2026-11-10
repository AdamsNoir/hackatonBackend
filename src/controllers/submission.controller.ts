import { Readable } from "stream";
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
  const audio = await submissionService.getAudioForUser(
    String(req.params.id),
    getRequestUser(req),
  );

  res.setHeader("Cache-Control", "private, no-store");
  if ("audioUrl" in audio) {
    // Proxy the private Cloudinary file through this API. This preserves the
    // existing same-origin audio endpoint and supports HTTP Range requests.
    if (!audio.audioUrl) {
      throw new ApiError(502, "Impossible de générer l'URL de l'audio cloud.");
    }
    const upstream = await fetch(audio.audioUrl, {
      headers: req.headers.range ? { Range: req.headers.range } : undefined,
    });

    if (!upstream.ok || !upstream.body) {
      throw new ApiError(502, "Impossible de récupérer l'audio depuis le stockage cloud.");
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


// POST /submissions/:id/migrate (admin: retry a failed local-to-cloud migration)
export const retryAudioMigration = asyncHandler(async (req, res) => {
  const submission = await submissionService.migrateSubmissionAudio(String(req.params.id));
  if (!submission) throw ApiError.notFound("Soumission introuvable.");
  res.json({
    id: submission.id,
    status: submission.status,
    storageStatus: submission.storageStatus,
    migratedAt: submission.migratedAt ?? null,
    message: submission.storageStatus === "cloudinary"
      ? "Enregistrement transféré vers Cloudinary."
      : submission.storageStatus === "migrating"
        ? "Transfert déjà en cours."
        : "Transfert non effectué. Vérifiez la configuration et réessayez.",
  });
});

// GET /submissions/stats   (admin)
export const getStats = asyncHandler(async (_req, res) => {
  res.json(await submissionService.getStats());
});
