import mongoose from "mongoose";

/**
 * Booking couvre 3 types de commandes :
 *  - "location"  : réservation véhicule avec dates
 *  - "essai"     : demande de rendez-vous pour essai (vente)
 *  - "chauffeur" : réservation d'un chauffeur
 */
const bookingSchema = new mongoose.Schema({
  // ── Type de commande ──────────────────────────────────────
  type: {
    type: String,
    enum: ["location", "essai", "chauffeur"],
    required: true,
  },

  // ── Statut de la commande ─────────────────────────────────
  status: {
    type: String,
    enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"],
    default: "pending",
  },

  // ── Parties impliquées ────────────────────────────────────
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null, // null si non connecté
  },

  // Infos client (remplies même si non connecté)
  clientInfo: {
    firstName: { type: String, required: true },
    lastName:  { type: String, required: true },
    email:     { type: String, required: true },
    phone:     { type: String },
  },

  // Véhicule réservé (location ou essai)
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    default: null,
  },

  // Chauffeur réservé
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    default: null,
  },

  // ── Champs spécifiques : LOCATION ─────────────────────────
  location: {
    startDate:      { type: Date },
    endDate:        { type: Date },
    days:           { type: Number, default: 0 },
    pickupLocation: { type: String },
    returnLocation: { type: String },
    options: {
      gps:       { type: Boolean, default: false },
      babySeat:  { type: Boolean, default: false },
      insurance: { type: Boolean, default: false },
      driver:    { type: Boolean, default: false },
    },
  },

  // ── Champs spécifiques : ESSAI ────────────────────────────
  essai: {
    preferredDate: { type: Date },
    preferredTime: { type: String },
    notes:         { type: String },
  },

  // ── Champs spécifiques : CHAUFFEUR ────────────────────────
  chauffeur: {
    date:        { type: Date },
    heures:      { type: Number },
    lieuDepart:  { type: String },
    destination: { type: String },
    notes:       { type: String },
  },

  // ── Financier (FCFA / XOF) ────────────────────────────────
  montantBase:    { type: Number, default: 0 },
  montantOptions: { type: Number, default: 0 },
  montantTotal:   { type: Number, default: 0 },
  devise:         { type: String, default: "XOF" },

  // ── Paiement ──────────────────────────────────────────────
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    default: null,
  },
  isPaid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },

  // ── Avis post-commande ────────────────────────────────────
  review: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Review",
    default: null,
  },

  // ── Annulation ────────────────────────────────────────────
  cancelledAt:  { type: Date, default: null },
  cancelReason: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

bookingSchema.index({ client: 1 });
bookingSchema.index({ vehicle: 1 });
bookingSchema.index({ driver: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ type: 1 });
bookingSchema.index({ createdAt: -1 });

bookingSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export default Booking;
