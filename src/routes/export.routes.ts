import { Router } from "express";
import * as exportController from "../controllers/export.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { createExportTicketSchema } from "../validators/export.validator";

/* Routes under /api/admin/export (admin only).
   The download itself is authenticated by a one-time ticket, see utils/exportTicket.ts */
const router = Router();
router.post("/ticket", requireAuth, requireRole("admin"), validateBody(createExportTicketSchema), exportController.createTicket);
router.get("/download", exportController.download);
export default router;
