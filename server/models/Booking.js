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
  //
  // "driver_arrived" est distinct de "client_arrived" : réservé aux missions
  // chauffeur (type "chauffeur"), c'est le CLIENT ("l'employeur") qui confirme
  // que le chauffeur est arrivé pour démarrer la mission — alors que
  // "client_arrived" est déclenché par le PARTENAIRE et signifie autre chose
  // selon le type (destination atteinte pour un chauffeur, présence du client
  // pour une location). Voir bookingController.markDriverArrived/completeMission.
  status: {
    type: String,
    enum: [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "client_absent", "driver_arrived",
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

    // Frais de livraison — calculé côté serveur (Haversine), jamais fourni par le client
    deliveryFee:    { type: Number, default: 0 },

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

  // ── Champs spécifiques : ESSAI (rendez-vous d'essai avant achat) ──────────
  essai: {
    preferredDate: { type: Date },
    preferredTime: { type: String },
    // Calculée côté serveur (preferredDate + preferredTime + durée fixe),
    // jamais depuis le client — même principe que chauffeur.dateFin : permet
    // de détecter qu'un véhicule en vente est déjà réservé pour un essai sur
    // le même créneau (aucun contrôle n'existait auparavant).
    dateFin:       { type: Date },
    notes:         { type: String },
  },

  // ── Champs spécifiques : CHAUFFEUR ────────────────────────
  chauffeur: {
    date:        { type: Date },
    // Calculé côté serveur (date + heures), jamais depuis le client — permet
    // une détection de conflit de planning efficace au niveau requête Mongo,
    // sur le même principe que location.startDate/endDate pour les véhicules.
    dateFin:     { type: Date },
    heures:      { type: Number },
    lieuDepart:  { type: String },
    destination: { type: String },
    notes:       { type: String },
  },

  // ── Financier (USD — voir server/scripts/migrate-vehicle-booking-to-usd.mjs
  // pour la migration des réservations créées avant ce changement de pivot,
  // toutes implicitement en FCFA/XOF) ───────────────────────
  montantBase:    { type: Number, default: 0 },
  montantOptions: { type: Number, default: 0 },
  montantTotal:   { type: Number, default: 0 },
  devise:         { type: String, default: "USD" },

  // ── Commission & Frais plateforme ─────────────────────────
  // Taux résolus dynamiquement par pricingEngine.resolveCommissionRate() (voir
  // server/services/pricingEngine.js) — PricingConfig est la source de vérité,
  // pas ces defaults (utilisés seulement si jamais recalculés).
  commissionRate:   { type: Number, default: 0 },      // ex: 0.15
  commissionAmount: { type: Number, default: 0 },      // montantBase * commissionRate
  serviceFeeFCFA:   { type: Number, default: 1 },      // nom conservé (voir Vehicle/Booking dans le plan de refonte), désormais en USD — calculé par pricingEngine.computeServiceFee()
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
    // Le type "leasing" de Booking couvre à la fois une demande de Leasing
    // (LOA) et de Crédit classique (Vehicle.leasing / Vehicle.credit) — même
    // machine à états et mêmes champs financiers, seul le produit choisi par
    // le client diffère (voir Vehicle.credit, ajouté en parallèle du leasing).
    financingType: { type: String, enum: ["leasing", "credit"], default: "leasing" },
    apportInitial: { type: Number, default: 0 },
    mensualite:    { type: Number, default: 0 },
    duree:         { type: Number, default: 36 },
    tauxInteret:   { type: Number, default: 8 },
    totalLeasing:  { type: Number, default: 0 },

    // ── Décision admin (revue manuelle — aucune banque partenaire intégrée
    // pour l'instant, voir server/controllers/bookingController.js
    // setFinancingDecision) ──────────────────────────────────────────────
    decision:     { type: String, enum: ["en_etude", "accepte", "refuse"], default: "en_etude" },
    decisionNote: { type: String, default: null },
    decisionAt:   { type: Date,   default: null },
    decisionBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // ── Transaction finale (saisie partenaire) ───────────────
  transaction: {
    finalAmount:    { type: Number, default: null },
    paymentMethod:  { type: String, default: null },   // cash | card | orange_money | wave | mtn | moov
    comment:        { type: String, default: null },
    recordedAt:     { type: Date,   default: null },
    recordedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // ── Mode de financement réellement conclu (essai/vente uniquement) ──────
    // Distinct de paymentMethod (le rail de paiement de l'apport initial) :
    // décrit COMMENT l'achat a été financé, négocié sur place lors de la
    // conclusion de la transaction — peut différer des conditions leasing/
    // crédit publiées sur l'annonce (voir Vehicle.leasing / Vehicle.credit).
    financing: {
      type:          { type: String, enum: ["comptant", "leasing", "credit"], default: "comptant" },
      apportInitial: { type: Number, default: 0 },
      mensualite:    { type: Number, default: 0 },
      duree:         { type: Number, default: 0 },
      tauxInteret:   { type: Number, default: 0 },
    },
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
bookingSchema.index({ driver: 1, status: 1, "chauffeur.date": 1, "chauffeur.dateFin": 1 });
bookingSchema.index({ vehicle: 1, status: 1, "essai.preferredDate": 1, "essai.dateFin": 1 });

bookingSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export default Booking;
