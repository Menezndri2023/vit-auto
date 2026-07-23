import express from "express";
import { rateLimit } from "express-rate-limit";
import * as r from "../controllers/reviewController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const moderationScope = requireAdminScope("moderation");

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
router.get  ("/admin/list", authenticate, authorizeAdmin, moderationScope, r.adminListReviews);
router.patch("/:id/hide",   validateObjectId(), authenticate, authorizeAdmin, moderationScope, r.hideReview);
router.patch("/:id/unhide", validateObjectId(), authenticate, authorizeAdmin, moderationScope, r.unhideReview);

export default router;
