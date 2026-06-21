import express from "express";
import { getDeliveryFee, getCountries } from "../controllers/geoController.js";

const router = express.Router();

// GET — query params (?clientLat=&clientLng=&partnerLat=&partnerLng=&vehicleId=&countryCode=)
router.get("/delivery-fee", getDeliveryFee);
// POST — body (rétrocompat si besoin)
router.post("/delivery-fee", getDeliveryFee);
router.get("/countries",     getCountries);

export default router;
