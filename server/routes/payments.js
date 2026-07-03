import express from "express";
import * as paymentController from "../controllers/paymentController.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.post("/",                          optionalAuth, paymentController.createPayment);
router.get("/booking/:bookingId",         validateObjectId("bookingId"), authenticate, paymentController.getBookingPayment);

export default router;
