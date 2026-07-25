import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  // ── Lien avec la commande — exactement UN des trois (voir pre-validate
  // ci-dessous). ServiceRequest/InsuranceRequest couvrent le paiement d'un
  // devis approuvé (assurance, transport, garantie...), qui n'avait jusqu'ici
  // aucun moyen de règlement depuis l'interface client.
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    default: null,
  },
  serviceRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceRequest",
    default: null,
  },
  insuranceRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InsuranceRequest",
    default: null,
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
  // Jeton secret à haute entropie généré côté serveur à la création du checkout
  // (Orange Money uniquement — ne signe pas ses callbacks avec un HMAC standard,
  // voir orangeMoneyProvider.js). Embarqué dans notif_url, jamais renvoyé au
  // client : sans lui, n'importe qui connaissant/devinant un order_id pourrait
  // simuler un paiement réussi en appelant directement le webhook.
  webhookToken: { type: String, default: null, select: false },

  // ── Remboursement ─────────────────────────────────────────
  refundedAt:    { type: Date, default: null },
  refundReason:  { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
});

paymentSchema.index({ booking: 1 });
paymentSchema.index({ serviceRequest: 1 });
paymentSchema.index({ insuranceRequest: 1 });
paymentSchema.index({ status: 1 });
// Un seul paiement actif (pending/completed) par cible — empêche les doublons
// en cas de double-clic/retry concurrent, contrainte appliquée au niveau base.
paymentSchema.index(
  { booking: 1 },
  { unique: true, partialFilterExpression: { booking: { $type: "objectId" }, status: { $in: ["pending", "completed"] } }, name: "unique_active_payment_per_booking" }
);
paymentSchema.index(
  { serviceRequest: 1 },
  { unique: true, partialFilterExpression: { serviceRequest: { $type: "objectId" }, status: { $in: ["pending", "completed"] } }, name: "unique_active_payment_per_service_request" }
);
paymentSchema.index(
  { insuranceRequest: 1 },
  { unique: true, partialFilterExpression: { insuranceRequest: { $type: "objectId" }, status: { $in: ["pending", "completed"] } }, name: "unique_active_payment_per_insurance_request" }
);

// Exactement une cible (booking XOR serviceRequest XOR insuranceRequest).
paymentSchema.pre("validate", function (next) {
  const targets = [this.booking, this.serviceRequest, this.insuranceRequest].filter(Boolean);
  if (targets.length !== 1) {
    return next(new Error("Un paiement doit référencer exactement une cible (booking, serviceRequest ou insuranceRequest)."));
  }
  next();
});

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
export default Payment;
