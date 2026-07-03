import mongoose from "mongoose";

// ── Sous-schémas ───────────────────────────────────────────────────────────

const docStatusSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["non_requis", "en_attente", "fourni", "valide"],
    default: "en_attente",
  },
  url:        { type: String, default: null },
  uploadedAt: { type: Date,   default: null },
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  changedAt: { type: Date,   default: Date.now },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  note:      { type: String, default: null },
}, { _id: false });

// ── Schéma principal ───────────────────────────────────────────────────────

const ieTransactionSchema = new mongoose.Schema({
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ImportExportListing",
    required: true,
    index: true,
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Statut (cycle de vie 14 étapes) ───────────────────────────────────────
  status: {
    type: String,
    enum: [
      "reserved",              // 4. Réservation gratuite
      "confirmed",             // 5. Confirmation fournisseur
      "in_discussion",         // 6. Discussion sécurisée
      "inspection_requested",  // 7. Inspection indépendante demandée
      "inspection_done",       // 7. Inspection terminée
      "offer_sent",            // 8. Offre finale envoyée
      "offer_accepted",        // 8. Offre acceptée
      "payment_pending",       // 9. En attente de paiement
      "in_escrow",             // 9. Fonds en entiercement
      "preparing",             // 10. Préparation export
      "shipped",               // 11. Expédié
      "in_transit",            // 11. En transit
      "delivered",             // 12. Livré
      "funds_released",        // 13. Fonds libérés
      "completed",             // 14. Transaction complète
      "disputed",              // Litige ouvert
      "cancelled",             // Annulé
    ],
    default: "reserved",
  },

  // ── Destination client ─────────────────────────────────────────────────────
  destCountry: { type: String, trim: true },
  destCity:    { type: String, trim: true },
  notes:       { type: String, trim: true, maxlength: 1000 },

  // ── Délai d'expiration de réservation (72h par défaut) ────────────────────
  reservedAt:          { type: Date, default: Date.now },
  reservationExpires:  { type: Date, default: () => new Date(Date.now() + 72 * 60 * 60 * 1000) },

  // ── Inspection indépendante VIT AUTO (optionnelle — étape 7) ─────────────
  independentInspection: {
    requested:    { type: Boolean, default: false },
    requestedAt:  { type: Date,    default: null },
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reportNotes:  { type: String,  default: null },
    completedAt:  { type: Date,    default: null },
  },

  // ── Offre finale du fournisseur (étape 8) ─────────────────────────────────
  finalOffer: {
    vehiclePrice:  { type: Number, default: null },
    exportFees:    { type: Number, default: 0 },
    shippingCost:  { type: Number, default: 0 },
    insurance:     { type: Number, default: 0 },
    totalAmount:   { type: Number, default: null },
    currency:      { type: String, default: "EUR" },
    estimatedDelay:{ type: String, default: null }, // ex: "45-60 jours"
    notes:         { type: String, default: null },
    sentAt:        { type: Date,   default: null },
    acceptedAt:    { type: Date,   default: null },
  },

  // ── Paiement escrow (étape 9) ─────────────────────────────────────────────
  payment: {
    amount:         { type: Number, default: null },
    currency:       { type: String, default: "EUR" },
    method:         { type: String, default: null }, // virement, carte, crypto...
    transactionRef: { type: String, default: null },
    paidAt:         { type: Date,   default: null },
    releasedAt:     { type: Date,   default: null },
    escrowRef:      { type: String, default: null },
  },

  // ── Documents d'export (étape 10) ─────────────────────────────────────────
  documents: {
    commercialInvoice: { type: docStatusSchema, default: () => ({}) },
    customsDocs:       { type: docStatusSchema, default: () => ({}) },
    originCertificate: { type: docStatusSchema, default: () => ({}) },
    billOfLading:      { type: docStatusSchema, default: () => ({}) },
    inspectionDocs:    { type: docStatusSchema, default: () => ({}) },
    transportBooking:  { type: docStatusSchema, default: () => ({}) },
  },

  // ── Expédition (étape 11) ─────────────────────────────────────────────────
  shipping: {
    carrier:          { type: String, default: null },
    trackingNumber:   { type: String, default: null },
    shippingType:     {
      type: String,
      enum: ["maritime", "terrestre", "aerien", null],
      default: null,
    },
    departureDate:    { type: Date, default: null },
    estimatedArrival: { type: Date, default: null },
    currentStatus:    { type: String, default: null },
    shippedAt:        { type: Date, default: null },
  },

  // ── Livraison (étape 12) ──────────────────────────────────────────────────
  deliveredAt:           { type: Date,   default: null },
  deliveryConfirmedAt:   { type: Date,   default: null },
  deliveryNotes:         { type: String, default: null },

  // ── Chat lié ──────────────────────────────────────────────────────────────
  chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", default: null },

  // ── Évaluations mutuelles (étape 14) ─────────────────────────────────────
  clientReview: {
    rating:    { type: Number, min: 1, max: 5, default: null },
    comment:   { type: String, default: null },
    createdAt: { type: Date,   default: null },
  },
  partnerReview: {
    rating:    { type: Number, min: 1, max: 5, default: null },
    comment:   { type: String, default: null },
    createdAt: { type: Date,   default: null },
  },

  // ── Litige ────────────────────────────────────────────────────────────────
  dispute: {
    opened:     { type: Boolean, default: false },
    openedAt:   { type: Date, default: null },
    openedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason:     { type: String, default: null },
    resolution: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // ── Historique des changements de statut ──────────────────────────────────
  statusHistory: [statusHistorySchema],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ieTransactionSchema.index({ client: 1, createdAt: -1 });
ieTransactionSchema.index({ partner: 1, createdAt: -1 });
ieTransactionSchema.index({ status: 1 });

ieTransactionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const IETransaction =
  mongoose.models.IETransaction ||
  mongoose.model("IETransaction", ieTransactionSchema);

export default IETransaction;
