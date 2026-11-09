import type { RequestHandler } from "express";

/* =====================================================================
   SANITIZE MIDDLEWARE (anti NoSQL injection, extra layer)
   Removes any key starting with "$" or containing "." from the body,
   query and params. Example: { "email": { "$gt": "" } } becomes
   { "email": {} } before it can reach the database.
   ===================================================================== */
const isDangerousKey = (key: string): boolean => key.startsWith("$") || key.includes(".");

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (!isDangerousKey(key)) result[key] = clean(inner);
    }
    return result;
  }
  return value;
}

export const sanitizeRequest: RequestHandler = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query) as typeof req.query;
  if (req.params) req.params = clean(req.params) as typeof req.params;
  next();
};
