import express from "express";
import * as r from "../controllers/reviewController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", r.getReviews);

// ── Client connecté ───────────────────────────────────────
router.post("/", authenticate, r.createReview);

// ── Admin ─────────────────────────────────────────────────
router.patch("/:id/hide", validateObjectId(), authenticate, authorizeAdmin, r.hideReview);

export default router;
