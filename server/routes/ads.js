import express from "express";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { getAds, getAllAds, createAd, updateAd, deleteAd, trackAdClick } from "../controllers/adsController.js";

const router = express.Router();
const vid = validateObjectId();

// Public
router.get("/",             getAds);
router.post("/:id/click",   vid, trackAdClick);

// Admin only
router.get("/all",          authenticate, authorizeAdmin, getAllAds);
router.post("/",            authenticate, authorizeAdmin, createAd);
router.put("/:id",          vid, authenticate, authorizeAdmin, updateAd);
router.delete("/:id",       vid, authenticate, authorizeAdmin, deleteAd);

export default router;
