import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { SECURITY } from "../config/security";

/* =====================================================================
   RATE LIMITERS
   Block visitors who send too many requests (brute force, spam).
   Numbers are in config/security.ts. When the limit is reached the
   frontend receives 429 + { "message": "..." }.
   ===================================================================== */
const buildLimiter = (
  windowMs: number,
  limit: number,
  message: string,
  options: { skipSuccessfulRequests?: boolean; perUser?: boolean } = {},
) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7", // sends RateLimit-* headers
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    // Upload limit is counted per logged-in user, the others per IP address
    keyGenerator: (req: Request) =>
      options.perUser && req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? ""),
    handler: (_req, res) => {
      res.status(429).json({ message });
    },
  });

const { rateLimit: limits } = SECURITY;

export const globalLimiter = buildLimiter(
  limits.global.windowMs,
  limits.global.limit,
  "Trop de requêtes. Veuillez patienter quelques minutes.",
);

// Only failed attempts are counted (successful logins are skipped)
export const loginLimiter = buildLimiter(
  limits.login.windowMs,
  limits.login.limit,
  "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
  { skipSuccessfulRequests: true },
);

export const registerLimiter = buildLimiter(
  limits.register.windowMs,
  limits.register.limit,
  "Trop d'inscriptions depuis cette adresse. Réessayez plus tard.",
);

export const uploadLimiter = buildLimiter(
  limits.upload.windowMs,
  limits.upload.limit,
  "Trop d'envois. Réessayez dans une heure.",
  { perUser: true },
);
