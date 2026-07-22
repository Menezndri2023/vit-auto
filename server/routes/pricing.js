import express from "express";
import * as pricing from "../controllers/pricingController.js";

const router = express.Router();

// Tout public — consulté au chargement de l'app (CurrencyContext.jsx) et par
// les pages de tarifs (Plans.jsx, VendorDashboard.jsx).
router.get("/currencies", pricing.getCurrencies);
router.get("/countries",  pricing.getCountries);
router.get("/config",     pricing.getPublicConfig);

export default router;
