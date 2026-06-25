import mongoose from "mongoose";

const invoiceLineSchema = new mongoose.Schema({
  booking:            { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  bookingRef:         { type: String },
  serviceType:        { type: String },  // location | essai | chauffeur | leasing
  montantTransaction: { type: Number, default: 0 },
  commissionRate:     { type: Number, default: 0 },
  commissionAmount:   { type: Number, default: 0 },
  devise:             { type: String, default: "XOF" },
  completedAt:        { type: Date },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  reference:       { type: String, unique: true },
  partner:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  month:           { type: Number, required: true, min: 1, max: 12 },
  year:            { type: Number, required: true },
  lines:           [invoiceLineSchema],
  totalCommission: { type: Number, default: 0 },
  devise:          { type: String, default: "XOF" },
  status: {
    type: String,
    enum: ["pending", "paid", "overdue"],
    default: "pending",
  },
  dueDate:       { type: Date },
  paidAt:        { type: Date, default: null },
  paymentMethod: { type: String, default: null },
  notes:         { type: String, default: null },
  createdAt:     { type: Date, default: Date.now },
  updatedAt:     { type: Date, default: Date.now },
});

invoiceSchema.index({ partner: 1, year: 1, month: 1 }, { unique: true });
invoiceSchema.index({ status: 1 });

invoiceSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
export default Invoice;
