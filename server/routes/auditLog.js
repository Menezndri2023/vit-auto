import express from "express";
import * as a from "../controllers/auditLogController.js";
import { authenticate, authorizeAdmin, requireGeneralAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/admin/list",    authenticate, authorizeAdmin, requireGeneralAdmin, a.adminListAuditLog);
router.get("/admin/actions", authenticate, authorizeAdmin, requireGeneralAdmin, a.adminAuditLogFacets);

export default router;
