import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { SECURITY } from "../config/security";
import type { UserRole } from "../models/User";

/* =====================================================================
   JWT HELPERS
   The token contains: user id (sub), role, and "v" = tokenVersion.
   If the user changes password or logs out everywhere, tokenVersion
   goes up and every older token stops working.
   ===================================================================== */
export interface TokenPayload {
  sub: string; // user id
  role: UserRole;
  v: number; // token version
}

export const signAccessToken = (userId: string, role: UserRole, tokenVersion: number): string =>
  jwt.sign({ sub: userId, role, v: tokenVersion } satisfies TokenPayload, env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: SECURITY.jwtIssuer,
    audience: SECURITY.jwtAudience,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

export const verifyAccessToken = (token: string): TokenPayload =>
  jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"], // refuse any other algorithm (e.g. "none")
    issuer: SECURITY.jwtIssuer,
    audience: SECURITY.jwtAudience,
  }) as unknown as TokenPayload;
