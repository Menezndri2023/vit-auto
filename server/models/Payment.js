import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "EUR" },
  method: String,
  status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
  transactionId: String,
  createdAt: { type: Date, default: Date.now },
});

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
export default Payment;

