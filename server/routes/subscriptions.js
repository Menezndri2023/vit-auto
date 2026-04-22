import express from "express";
import {
  getMySubscription,
  activatePro,
  purchaseBoost,
  getPricing,
} from "../controllers/subscriptionController.js";
import { authenticate as protect } from "../middleware/auth.js";

const router = express.Router();

// Public
router.get("/pricing", getPricing);

// Protégé (vendeur connecté)
router.get("/me",          protect, getMySubscription);
router.post("/activate-pro", protect, activatePro);
router.post("/boost",        protect, purchaseBoost);

export default router;
