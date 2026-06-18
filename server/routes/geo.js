import express from "express";
import { getDeliveryFee, getCountries } from "../controllers/geoController.js";

const router = express.Router();

router.post("/delivery-fee", getDeliveryFee);
router.get("/countries",     getCountries);

export default router;
