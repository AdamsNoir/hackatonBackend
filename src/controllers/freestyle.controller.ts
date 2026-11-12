import { getRequestUser } from "../middlewares/auth.middleware";
import * as freestyleService from "../services/freestyle.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { createFreestyleSchema } from "../validators/freestyle.validator";

/* GET /freestyle/phrases?count=15 */
export const getPhrases = asyncHandler(async (req, res) => {
  const { count } = req.query as unknown as { count: number };
  res.json(await freestyleService.getRandomPhrases(getRequestUser(req).id, count));
});

/* POST /freestyle  (multipart: audio, phraseId, durationSeconds, angryStartSeconds) */
export const createRecording = asyncHandler(async (req, res) => {
  const user = getRequestUser(req);
  if (!req.file) throw ApiError.badRequest("Aucun fichier audio reçu (champ « audio »).");
  const { phraseId, durationSeconds, angryStartSeconds } = createFreestyleSchema.parse(req.body);
  const rec = await freestyleService.createRecording({
    userId: user.id,
    phraseId,
    file: req.file,
    clientDuration: durationSeconds,
    angryStartSeconds,
  });
  res.status(201).json({ id: rec.id, phraseId, durationSeconds: rec.durationSeconds });
});

/* GET /freestyle/mine */
export const listMine = asyncHandler(async (req, res) => {
  res.json(await freestyleService.listMine(getRequestUser(req).id));
});

/* GET /freestyle/:id/audio-url */
export const getAudioUrl = asyncHandler(async (req, res) => {
  res.json(await freestyleService.getAudioUrl(String(req.params.id), getRequestUser(req)));
});
