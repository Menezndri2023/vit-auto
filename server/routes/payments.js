import express from "express";
import * as paymentController from "../controllers/paymentController.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/",                          optionalAuth, paymentController.createPayment);     // création paiement (auth optionnelle)
router.get("/booking/:bookingId",         authenticate, paymentController.getBookingPayment); // détail paiement

export default router;
