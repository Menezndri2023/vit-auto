import express from "express";
import * as loyalty from "../controllers/loyaltyController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/tiers",      loyalty.getLoyaltyTiers);
router.get("/me",         authenticate, loyalty.getMyLoyaltyStatus);
router.get("/me/history", authenticate, loyalty.getMyLoyaltyHistory);

export default router;
