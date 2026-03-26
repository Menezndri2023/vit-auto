import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
  vehicleName: String,
  driverName: String,
  type: String, // location/vente/driver
  pricePerDay: Number,
  startDate: Date,
  endDate: Date,
  pickupLocation: String,
  total: Number,
  paymentMethod: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export default Booking;
