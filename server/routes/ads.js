import express from "express";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { getAds, getAllAds, createAd, updateAd, deleteAd, trackAdClick } from "../controllers/adsController.js";

const router = express.Router();
const vid = validateObjectId();

// Public
router.get("/",             getAds);
router.post("/:id/click",   vid, trackAdClick);

// Admin only
router.get("/all",          authenticate, authorizeAdmin, requireAdminScope("catalogue"), getAllAds);
router.post("/",            authenticate, authorizeAdmin, requireAdminScope("catalogue"), createAd);
router.put("/:id",          vid, authenticate, authorizeAdmin, requireAdminScope("catalogue"), updateAd);
router.delete("/:id",       vid, authenticate, authorizeAdmin, requireAdminScope("catalogue"), deleteAd);

export default router;
