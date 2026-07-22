import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  // ── Lien avec la commande ─────────────────────────────────
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },

  // ── Montant (USD) ──────────────────────────────────────────
  amount:   { type: Number, required: true },
  devise:   { type: String, default: "USD" },

  // ── Méthode de paiement ───────────────────────────────────
  method: {
    type: String,
    enum: ["card", "orange_money", "wave", "mtn", "moov", "paypal", "applepay", "cash", "virement", "test"],
    required: true,
  },

  // ── Statut ────────────────────────────────────────────────
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded"],
    default: "pending",
  },

  // ── Référence externe (ID transaction/session opérateur) ──
  transactionId: { type: String, default: null },

  // ── Détails selon méthode (données masquées) ──────────────
  paymentDetails: {
    // Carte bancaire
    cardLast4:   { type: String },
    cardHolder:  { type: String },
    // Mobile Money
    mobileNumber:{ type: String },
    // Commun
    provider:    { type: String },
  },

  // ── Passerelle réelle (Stripe/Orange Money/Wave) ──────────
  // URL de paiement à laquelle rediriger le client (checkout hébergé par le
  // fournisseur) — null tant que le paiement n'est pas initié.
  checkoutUrl: { type: String, default: null },
  // true si aucun identifiant fournisseur n'était configuré au moment du
  // paiement (voir server/services/payment/) : le paiement a été traité par
  // le mode sandbox interne, pas par un vrai fournisseur — jamais à confondre
  // avec un paiement réellement encaissé, distinction utile pour l'admin.
  simulated: { type: Boolean, default: false },
  // Horodatage de la dernière notification webhook reçue (audit).
  webhookReceivedAt: { type: Date, default: null },

  // ── Remboursement ─────────────────────────────────────────
  refundedAt:    { type: Date, default: null },
  refundReason:  { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
});

paymentSchema.index({ booking: 1 });
paymentSchema.index({ status: 1 });
// Un seul paiement actif (pending/completed) par réservation — empêche les doublons
// en cas de double-clic/retry concurrent, contrainte appliquée au niveau base.
paymentSchema.index(
  { booking: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "completed"] } }, name: "unique_active_payment_per_booking" }
);

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
export default Payment;
