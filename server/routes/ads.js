import express from "express";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { getAds, getAllAds, createAd, updateAd, deleteAd, trackAdClick } from "../controllers/adsController.js";

const router = express.Router();

// Public
router.get("/",             getAds);
router.post("/:id/click",   trackAdClick);

// Admin only
router.get("/all",          authenticate, authorizeAdmin, getAllAds);
router.post("/",            authenticate, authorizeAdmin, createAd);
router.put("/:id",          authenticate, authorizeAdmin, updateAd);
router.delete("/:id",       authenticate, authorizeAdmin, deleteAd);

export default router;
