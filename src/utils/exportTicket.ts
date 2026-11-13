import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { ExportKind } from "../services/export.service";

/* =====================================================================
   EXPORT TICKET
   The zip is downloaded by the browser itself (a normal link), which cannot
   send the "Authorization" header. So an admin first asks for a ticket
   (POST, authenticated), then opens the download link with that ticket.
   A ticket lives 60 seconds and works ONCE.
   ===================================================================== */
const AUDIENCE = "export-download"; // different from the login token: one cannot replace the other
const TTL_SECONDS = 60;

export interface ExportTicket {
  sub: string; // admin id
  kind: ExportKind;
  personal: boolean;
  jti: string;
}

const used = new Map<string, number>(); // jti -> expiry (ms)

export const signExportTicket = (userId: string, kind: ExportKind, personal: boolean): string =>
  jwt.sign({ kind, personal }, env.JWT_SECRET, {
    algorithm: "HS256",
    audience: AUDIENCE,
    subject: userId,
    jwtid: crypto.randomUUID(),
    expiresIn: TTL_SECONDS,
  });

/** Returns the ticket content, or null if it is invalid, expired or already used. */
export function consumeExportTicket(token: string): ExportTicket | null {
  const now = Date.now();
  for (const [jti, expiry] of used) if (expiry < now) used.delete(jti);

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], audience: AUDIENCE }) as jwt.JwtPayload;
  } catch {
    return null;
  }
  const { sub, jti, kind, personal } = payload;
  if (!sub || !jti || (kind !== "freestyle" && kind !== "contest") || used.has(jti)) return null;
  used.set(jti, now + (TTL_SECONDS + 5) * 1000);
  return { sub, jti, kind, personal: personal === true };
}
