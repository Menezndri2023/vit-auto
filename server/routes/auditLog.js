import express from "express";
import * as a from "../controllers/auditLogController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/admin/list",    authenticate, authorizeAdmin, a.adminListAuditLog);
router.get("/admin/actions", authenticate, authorizeAdmin, a.adminAuditLogFacets);

export default router;
