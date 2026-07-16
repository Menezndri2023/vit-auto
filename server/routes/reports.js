import express from "express";
import * as r from "../controllers/reportController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { rateLimit } from "express-rate-limit";

const router = express.Router();
const vid = validateObjectId();

const createReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { message: "Trop de signalements envoyés. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post ("/",             authenticate, createReportLimiter, r.createReport);
router.get  ("/admin",         authenticate, authorizeAdmin,      r.getReports);
router.patch("/admin/:id",     vid, authenticate, authorizeAdmin, r.updateReportStatus);

export default router;
