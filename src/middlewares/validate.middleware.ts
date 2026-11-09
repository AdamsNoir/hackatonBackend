import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

/* =====================================================================
   VALIDATE MIDDLEWARES
   Check (and clean) req.body / req.query / req.params with a zod schema
   BEFORE the controller runs. If the data is wrong, the error handler
   sends a 400 with a readable message.
   Usage: router.post("/", validateBody(registerSchema), controller)
   ===================================================================== */
export const validateBody =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };

export const validateQuery =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    req.query = schema.parse(req.query);
    next();
  };

export const validateParams =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    req.params = schema.parse(req.params);
    next();
  };
