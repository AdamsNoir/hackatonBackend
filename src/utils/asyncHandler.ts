import type { NextFunction, Request, RequestHandler, Response } from "express";

/* Wraps an async controller so errors go to the error middleware
   (no try/catch needed in every controller). */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
