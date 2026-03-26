import { useDB } from "../config/db.js";
import Booking from "../models/Booking.js";
import { authenticate } from "../middleware/auth.js";

export const getMyBookings = [authenticate, async (req, res) => {
  const bookings = await Booking.find({ userId: req.user._id })
    .populate("vehicleId");

  res.json(bookings);
}];


export const createBooking = [authenticate, async (req, res) => {
  try {
    const booking = await Booking.create({
      ...req.body,
      userId: req.user._id,
      status: "pending",
    });

    res.status(201).json(booking);
  } catch (err) {
    res.status(400).json(err);
  }
}];


