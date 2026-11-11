import { getRequestUser } from "../middlewares/auth.middleware";
import * as phraseService from "../services/phrase.service";
import { asyncHandler } from "../utils/asyncHandler";

/* GET /phrases?page=1   (logged in)
   page 1 = the 5 graded phrases; next pages = a few practice phrases. */
export const listPhrases = asyncHandler(async (req, res) => {
  res.json(await phraseService.listPhrases(getRequestUser(req).id, req.query as never));
});

/* POST /phrases   (admin) */
export const createPhrases = asyncHandler(async (req, res) => {
  res.status(201).json(await phraseService.createPhrases(req.body));
});
