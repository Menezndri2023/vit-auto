import express from "express";
import * as de from "../controllers/driverEmploymentController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

// ── Client (employeur) ────────────────────────────────────
router.post("/",                    authenticate, de.createEmploymentRequest);
router.get("/mine",                 authenticate, de.getMyEmploymentRequests);
router.patch("/:id/cancel",         vid, authenticate, de.cancelEmploymentRequest);
router.get("/:id/contract-pdf",     vid, authenticate, de.downloadEmploymentContractPdf);

// ── Partenaire (propriétaire du profil chauffeur) ─────────
router.get("/received",             authenticate, de.getReceivedEmploymentRequests);
router.patch("/:id/respond",        vid, authenticate, de.respondToEmploymentRequest);

// ── Admin ──────────────────────────────────────────────────
router.get("/admin/list",           authenticate, authorizeAdmin, de.adminListEmploymentRequests);
router.patch("/:id/admin-review",   vid, authenticate, authorizeAdmin, de.adminReviewEmploymentRequest);
router.patch("/:id/process",        vid, authenticate, authorizeAdmin, de.processEmploymentRequest);

export default router;
