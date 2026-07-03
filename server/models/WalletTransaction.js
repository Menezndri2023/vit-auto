import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Wallet",
    required: true,
  },

  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true,
  },

  amount:   { type: Number, required: true, min: 0 },
  currency: { type: String, default: "XOF" },

  // Solde après transaction
  balanceAfter: { type: Number, required: true },

  // Source de la transaction
  source: {
    type: String,
    enum: ["booking", "sale", "commission", "refund", "withdrawal", "adjustment", "escrow_release"],
    required: true,
  },

  // Référence à la transaction source (bookingId, orderId, etc.)
  referenceId:   { type: String, default: null },
  referenceType: { type: String, default: null },

  description: { type: String, default: null },
  note:        { type: String, default: null },  // note admin

  // Statut (pour les débits qui nécessitent confirmation)
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "cancelled"],
    default: "completed",
  },

  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  createdAt: { type: Date, default: Date.now },
});

walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ source: 1, referenceId: 1 });

const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model("WalletTransaction", walletTransactionSchema);
export default WalletTransaction;
