import mongoose from "mongoose";

const driverSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  licenseNumber: { type: String, required: true },
  location: String,
  pricePerDay: Number,
  images: [String],
  rating: { type: Number, default: 0 },
  available: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: { type: Date, default: Date.now },
});

const Driver = mongoose.models.Driver || mongoose.model("Driver", driverSchema);
export default Driver;

