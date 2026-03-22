import express from "express";
import Booking from "../models/Booking.js";
import { useDB } from "../db/index.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const db = useDB(Booking, "bookings");
    const bookings = await db.find({ userId: req.user._id });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Erreur de lecture des réservations" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const db = useDB(Booking, "bookings");
    const bookingData = { ...req.body, userId: req.user._id, status: "pending", createdAt: new Date() };
    const booking = await db.create(bookingData);
    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ message: "Erreur de création de réservation", error: error.message });
  }
});

export default router;
