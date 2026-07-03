import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  // Propriétaire (user OU partner — l'un des deux est renseigné)
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User",    default: null },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", default: null },

  balance:  { type: Number, default: 0, min: 0 },
  currency: { type: String, default: "XOF" },

  status: {
    type: String,
    enum: ["active", "suspended", "closed"],
    default: "active",
  },

  // Totaux cumulés (pour analytics)
  totalCredited: { type: Number, default: 0 },
  totalDebited:  { type: Number, default: 0 },

  lastTransactionAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

walletSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

walletSchema.index({ userId: 1 }, { sparse: true });
walletSchema.index({ partnerId: 1 }, { sparse: true });

const Wallet = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
export default Wallet;
