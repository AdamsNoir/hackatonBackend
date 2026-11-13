import { getRequestUser } from "../middlewares/auth.middleware";
import { User } from "../models/User";
import { exportFileName, writeExport } from "../services/export.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { consumeExportTicket, signExportTicket } from "../utils/exportTicket";
import { createExportTicketSchema, exportDownloadQuerySchema } from "../validators/export.validator";

let exportRunning = false; // one export at a time: protects the memory of a small server

/* POST /admin/export/ticket  ->  { url } to open in the browser */
export const createTicket = asyncHandler(async (req, res) => {
  const { kind, personal } = createExportTicketSchema.parse(req.body);
  // Tell the admin now, in the page, instead of failing later on the download link
  if (exportRunning) throw new ApiError(429, "Un export est déjà en cours. Réessayez dans quelques minutes.");
  const ticket = signExportTicket(getRequestUser(req).id, kind, personal);
  res.json({ url: `/admin/export/download?ticket=${encodeURIComponent(ticket)}` });
});

/* GET /admin/export/download?ticket=...  ->  the zip (streamed) */
export const download = asyncHandler(async (req, res) => {
  const { ticket } = exportDownloadQuerySchema.parse(req.query);
  const content = consumeExportTicket(ticket);
  if (!content) throw ApiError.unauthorized("Lien d'export expiré ou déjà utilisé. Relancez l'export.");

  // Same checks as the login: the account must still exist, be active and be an admin
  const admin = await User.findById(content.sub).select("role isActive").lean();
  if (!admin || !admin.isActive || admin.role !== "admin") throw ApiError.forbidden();

  if (exportRunning) throw new ApiError(429, "Un export est déjà en cours. Réessayez dans quelques minutes.");
  exportRunning = true;
  try {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${exportFileName(content.kind)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    const summary = await writeExport(content.kind, res, { includePersonal: content.personal });
    console.log(`Export ${content.kind}: ${summary.ok}/${summary.total} audio files, ${summary.failed} failed.`);
  } catch (error) {
    if (!res.headersSent) throw error; // nothing sent yet: the normal JSON error answer
    console.error(`Export ${content.kind} stopped:`, error instanceof Error ? error.message : error);
    res.destroy(); // already streaming: cut the download so the browser shows it as failed
  } finally {
    exportRunning = false;
  }
});
