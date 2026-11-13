import { z } from "zod";

export const exportKindSchema = z.enum(["freestyle", "contest"]);

/* POST /admin/export/ticket */
export const createExportTicketSchema = z.object({
  kind: exportKindSchema,
  personal: z.boolean().optional().default(false), // include name / email / phone
});

/* GET /admin/export/download?ticket=... */
export const exportDownloadQuerySchema = z.object({
  ticket: z.string().min(20).max(2000),
});
