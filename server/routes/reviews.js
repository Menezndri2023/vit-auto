import express from "express";
import * as r from "../controllers/reviewController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", r.getReviews);                                                 // avis d'un véhicule ou chauffeur

// ── Client connecté ───────────────────────────────────────
router.post("/", authenticate, r.createReview);                                // laisser un avis

// ── Admin ─────────────────────────────────────────────────
router.patch("/:id/hide", authenticate, authorizeAdmin, r.hideReview);         // masquer un avis

export default router;
