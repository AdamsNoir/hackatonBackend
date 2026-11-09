import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { ZodError } from "zod";
import { AUDIO_RULES } from "../config/audioRules";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/* =====================================================================
   ERROR HANDLING
   Every error ends here and is sent as { "message": "..." },
   which is exactly what the frontend (apiClient) displays.
   Internal details are NEVER sent in production.
   ===================================================================== */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(ApiError.notFound("Route introuvable."));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Our own errors
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  // Invalid data (zod): first problem as "message", all problems per field in "errors"
  if (error instanceof ZodError) {
    res.status(400).json({
      message: error.issues[0]?.message ?? "Données invalides.",
      errors: error.flatten().fieldErrors,
    });
    return;
  }

  // Upload errors (file too big, wrong field name, ...)
  if (error instanceof multer.MulterError) {
    const tooBig = error.code === "LIMIT_FILE_SIZE";
    res.status(tooBig ? 413 : 400).json({
      message: tooBig ? `Le fichier dépasse ${AUDIO_RULES.maxFileSizeMb} Mo.` : "Erreur lors de l'envoi du fichier.",
    });
    return;
  }

  // Broken or too large JSON body
  if (error?.type === "entity.too.large") {
    res.status(413).json({ message: "Requête trop volumineuse." });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ message: "JSON invalide." });
    return;
  }

  // Duplicate email / phone (unique index)
  if (error?.code === 11000) {
    res.status(409).json({ message: "Un compte existe déjà avec cet email ou ce numéro de téléphone." });
    return;
  }

  // Bad MongoDB id
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: "Identifiant invalide." });
    return;
  }

  // Anything else = unexpected bug
  console.error(error);
  res.status(500).json({
    message: env.NODE_ENV === "production" ? "Erreur interne du serveur." : String(error?.message ?? error),
  });
};
