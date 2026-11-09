import { z } from "zod";

/* A MongoDB id: exactly 24 hexadecimal characters. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Identifiant invalide.");

export const idParamsSchema = z.object({ id: objectIdSchema });
