import express from "express";
import * as bookingController from "../controllers/bookingController.js";

const router = express.Router();

router.get("/", bookingController.getMyBookings);
router.post("/", bookingController.createBooking);

export default router;

