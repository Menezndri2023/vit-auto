import express from "express";
import { rateLimit } from "express-rate-limit";
import * as r from "../controllers/reviewController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

const createReviewLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             20,
  message:         { message: "Trop d'avis publiés. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Public ────────────────────────────────────────────────
router.get("/", r.getReviews);

// ── Client connecté ───────────────────────────────────────
router.post("/", authenticate, createReviewLimiter, r.createReview);

// ── Admin ─────────────────────────────────────────────────
router.get  ("/admin/list", authenticate, authorizeAdmin, r.adminListReviews);
router.patch("/:id/hide",   validateObjectId(), authenticate, authorizeAdmin, r.hideReview);
router.patch("/:id/unhide", validateObjectId(), authenticate, authorizeAdmin, r.unhideReview);

export default router;
