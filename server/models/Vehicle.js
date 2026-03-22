import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: String,
  mode: { type: String, enum: ["Louer", "Acheter"], default: "Louer" },
  description: String,
  image: String,
  pricePerDay: Number,
  buyPrice: Number,
  rating: Number,
  reviews: Number,
  distance: Number,
  seats: Number,
  transmission: String,
  fuel: String,
  available: { type: Boolean, default: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});

const Vehicle = mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
export default Vehicle;
