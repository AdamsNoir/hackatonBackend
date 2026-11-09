import type { UserRole } from "../models/User";

/* Adds "req.user" to Express (filled by the auth middleware). */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

export {};
