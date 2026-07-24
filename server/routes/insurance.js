import { Router } from "express";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { createRequest, getMyRequests, getAllRequests, setDecision, getRequestReceipt } from "../controllers/insuranceController.js";

const router = Router();
const vid = validateObjectId();

// ── Client connecté ─────────────────────────────────────────────────────────
router.post("/",      authenticate, createRequest);
router.get("/mine",   authenticate, getMyRequests);
router.get("/:id/receipt", vid, authenticate, getRequestReceipt);

// ── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin/list",         authenticate, authorizeAdmin, requireAdminScope("finance"), getAllRequests);
router.patch("/:id/decision", vid, authenticate, authorizeAdmin, requireAdminScope("finance"), setDecision);

export default router;
