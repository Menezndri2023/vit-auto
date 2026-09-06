import mongoose from "mongoose";

// Historique auditable des mouvements de points de fidélité — n'existait pas
// avant : User.loyaltyPoints n'était qu'un compteur brut sans trace des
// mouvements individuels (voir bookingController.js — awardLoyaltyPoints,
// createBooking, adminValidateBooking). Purement additif : n'affecte jamais
// le calcul du solde/palier lui-même, uniquement une trace pour le support
// et la page fidélité client (GET /api/loyalty/me/history).
const loyaltyTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["credit", "debit", "rollback"],
    required: true,
  },
  points: { type: Number, required: true, min: 0 }, // toujours positif, le signe est porté par `type`
  reason: { type: String, required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
  ieTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "IETransaction", default: null },
  balanceAfter: { type: Number, default: null }, // snapshot du solde dépensable après l'opération
  tierAtTime: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

loyaltyTransactionSchema.index({ user: 1, createdAt: -1 });

const LoyaltyTransaction = mongoose.models.LoyaltyTransaction || mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);
export default LoyaltyTransaction;
