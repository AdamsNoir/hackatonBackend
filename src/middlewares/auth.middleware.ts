import type { NextFunction, Request, Response } from "express";
import { User, type UserRole } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyAccessToken } from "../utils/jwt";

/* =====================================================================
   AUTH MIDDLEWARES
   requireAuth          -> checks "Authorization: Bearer <token>"
   requireRole("admin") -> only lets the given roles through

   requireAuth also checks in the database that the user still exists,
   is active, and that the token was not revoked (tokenVersion).
   ===================================================================== */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw ApiError.unauthorized("Session expirée. Veuillez vous reconnecter.");
  }

  const user = await User.findById(payload.sub).select("role tokenVersion isActive").lean();

  if (!user || !user.isActive || user.tokenVersion !== payload.v) {
    throw ApiError.unauthorized("Session invalide. Veuillez vous reconnecter.");
  }

  req.user = { id: String(user._id), role: user.role as UserRole };
  next();
});

export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

/* Returns the logged-in user (or throws). Use inside controllers. */
export function getRequestUser(req: Request): { id: string; role: UserRole } {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
