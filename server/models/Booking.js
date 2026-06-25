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
    enum: ["location", "essai", "chauffeur", "leasing"],
    required: true,
  },

  // ── Référence unique générée à la création ────────────────
  // Ex: VIT-LOC-2026-000001
  reference: { type: String, unique: true, sparse: true },

  // ── Statut de la commande ─────────────────────────────────
  // pending → confirmed → preparing → ready → in_progress
  //   → client_arrived | client_absent
  //   → transaction_concluded | transaction_not_concluded
  //   → waiting_client_validation → completed | disputed
  status: {
    type: String,
    enum: [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "client_absent",
      "transaction_concluded", "transaction_not_concluded",
      "waiting_client_validation",
      "completed", "cancelled", "disputed",
    ],
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
    firstName:  { type: String, required: true },
    lastName:   { type: String, required: true },
    email:      { type: String, required: true },
    phone:      { type: String },
    kycStatus:  { type: String, default: null },   // statut KYC au moment de la réservation
    kycScore:   { type: Number, default: null },
    kycVerified:{ type: Boolean, default: false },
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

    // Mode de prise en charge : "retrait" (agence) | "livraison" (domicile)
    pickupMethod:   { type: String, enum: ["retrait", "livraison"], default: "retrait" },

    // Prise en charge (texte + coordonnées GPS)
    pickupLocation: { type: String },
    pickupPosition: {
      lat:     { type: Number, default: null },
      lng:     { type: Number, default: null },
      address: { type: String, default: null },
    },

    // Point de retour / relais (texte + coordonnées GPS)
    returnLocation: { type: String },
    returnPosition: {
      lat:     { type: Number, default: null },
      lng:     { type: Number, default: null },
      address: { type: String, default: null },
    },

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

  // ── Commission & Frais plateforme ─────────────────────────
  // location → 15 % | vente/essai → 3 %
  commissionRate:   { type: Number, default: 0 },      // ex: 0.15
  commissionAmount: { type: Number, default: 0 },      // montantBase * commissionRate
  serviceFeeFCFA:   { type: Number, default: 1000 },   // 1 000 FCFA fixe
  cautionAmount:    { type: Number, default: 0 },      // caution / dépôt de garantie
  partnerPayout:    { type: Number, default: 0 },      // net versé au partenaire

  // ── Vérification client ───────────────────────────────────
  clientVerification: {
    idType:     { type: String, enum: ["cni", "passport", "permis", null], default: null },
    idNumber:   { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },

  // ── Instantané KYC complet (copié au moment de la réservation) ────────────
  clientKycSnapshot: {
    idType:            { type: String, default: null },
    idNumber:          { type: String, default: null },
    frontImage:        { type: String, default: null },
    backImage:         { type: String, default: null },
    selfie:            { type: String, default: null },
    licenseFrontImage: { type: String, default: null },
    licenseBackImage:  { type: String, default: null },
    licenseNumber:     { type: String, default: null },
    licenseExpiry:     { type: Date,   default: null },
    licenseCategories: { type: String, default: null },
    ocrData:           { type: mongoose.Schema.Types.Mixed, default: null },
    faceMatchScore:    { type: Number, default: null },
    kycStatus:         { type: String, default: null },
    kycScore:          { type: Number, default: null },
    snapshotAt:        { type: Date,   default: null },
  },

  // ── Vérification KYC manuelle par le partenaire (en présentiel) ──────────
  partnerKycVerification: {
    status:     { type: String, enum: ["non_verifie", "verifie", "rejete"], default: "non_verifie" },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date,   default: null },
    note:       { type: String, default: null },
  },

  // ── Contrat digital ───────────────────────────────────────
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    default: null,
  },

  // ── Paiement ──────────────────────────────────────────────
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    default: null,
  },
  isPaid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },

  // ── Leasing ───────────────────────────────────────────────
  leasing: {
    apportInitial: { type: Number, default: 0 },
    mensualite:    { type: Number, default: 0 },
    duree:         { type: Number, default: 36 },
    tauxInteret:   { type: Number, default: 8 },
    totalLeasing:  { type: Number, default: 0 },
  },

  // ── Transaction finale (saisie partenaire) ───────────────
  transaction: {
    finalAmount:    { type: Number, default: null },
    paymentMethod:  { type: String, default: null },   // cash | card | orange_money | wave | mtn | moov
    comment:        { type: String, default: null },
    recordedAt:     { type: Date,   default: null },
    recordedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // ── Validation client ──────────────────────────────────────
  clientValidation: {
    validatedAt:   { type: Date,   default: null },
    disputedAt:    { type: Date,   default: null },
    disputeReason: { type: String, default: null },
  },

  // ── Commission calculée sur transaction ───────────────────
  // (commissionRate et commissionAmount déjà présents, mise à jour au moment du completed)
  invoiced:   { type: Boolean, default: false },   // inclus dans une facture mensuelle
  invoice:    { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },

  // ── Avis post-commande ────────────────────────────────────
  review: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Review",
    default: null,
  },

  // ── Annulation ────────────────────────────────────────────
  cancelledAt:  { type: Date, default: null },
  cancelReason: { type: String, default: null },

  // ── Résolution de litige (Admin) ──────────────────────────
  disputeResolution: {
    resolution:   { type: String, enum: ["completed", "cancelled", "compensated", null], default: null },
    note:         { type: String, default: null },
    resolvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt:   { type: Date,   default: null },
    refundClient: { type: Boolean, default: false },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

bookingSchema.index({ client: 1 });
bookingSchema.index({ vehicle: 1 });
bookingSchema.index({ driver: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ type: 1 });
bookingSchema.index({ createdAt: -1 });
// Index pour la vérification de chevauchement de dates
bookingSchema.index({ vehicle: 1, status: 1, "location.startDate": 1, "location.endDate": 1 });

bookingSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export default Booking;
