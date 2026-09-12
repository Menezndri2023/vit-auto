import mongoose from "mongoose";
import crypto from "crypto";
import {
  SALE_LEAD_STATUSES, TEST_DRIVE_OUTCOMES, COMMERCIAL_OUTCOMES, FOLLOW_UP_RESPONSES,
} from "../constants/leadWorkflows.js";

// ── Prospect marketplace (vente par demande d'essai) ────────────────────────
//
// Ni un Booking (pas de paiement, pas de validation admin, pas de pièce
// d'identité, pas de contrat), ni un Lead PMS (CRM privé du partenaire, orienté
// export). C'est le dossier que VIT AUTO suit du premier clic « Demander un
// essai » jusqu'au résultat commercial, pour prouver l'origine d'une vente et
// facturer la commission. Voir docs/vente-demande-essai.md.

const historyEntry = new mongoose.Schema({
  action:    { type: String, required: true },
  actorType: { type: String, enum: ["CLIENT", "PARTNER", "ADMIN", "SYSTEM"], required: true },
  actorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  source:    { type: String, enum: ["DASHBOARD", "PUBLIC_LINK", "WHATSAPP", "EMAIL", "API", "SYSTEM"], default: "API" },
  from:      { type: String, default: null },
  to:        { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  metadata:  { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const salesLeadSchema = new mongoose.Schema({
  // Ex : VA-LEAD-2026-000482
  reference: { type: String, unique: true, sparse: true },

  // Clé de la machine à états (constants/leadWorkflows.js).
  workflow: { type: String, default: "SALE_TEST_DRIVE" },

  // ── Relations obligatoires (traçabilité de la commission) ────────────────
  vehicle:    { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
  partner:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "PartnerBusiness", default: null, index: true },

  // ── Client — compte facultatif, un invité peut demander un essai ─────────
  client: {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    firstName: { type: String, trim: true, required: true },
    lastName:  { type: String, trim: true, default: "" },
    phone:     { type: String, trim: true, required: true },
    whatsapp:  { type: String, trim: true, default: null },
    email:     { type: String, trim: true, lowercase: true, default: null },
    city:      { type: String, trim: true, default: null },
    country:   { type: String, uppercase: true, trim: true, default: null },
    language:  { type: String, default: "fr" },
    consent:   { type: Boolean, default: false },
    consentAt: { type: Date, default: null },
  },

  // ── Annonce figée à la création ──────────────────────────────────────────
  listingSnapshot: {
    title:    { type: String, default: null },
    marque:   { type: String, default: null },
    modele:   { type: String, default: null },
    annee:    { type: Number, default: null },
    priceUSD: { type: Number, default: null },
    currency: { type: String, default: "USD" },
    ville:    { type: String, default: null },
    country:  { type: String, default: null },
    image:    { type: String, default: null },
  },

  source:       { type: String, default: "vit_auto" },
  sourceDetail: { type: String, enum: ["vehicle_page", "callback", "admin", "other"], default: "vehicle_page" },
  requestType:  { type: String, enum: ["test_drive", "callback"], default: "test_drive" },

  // ── Souhait du client ────────────────────────────────────────────────────
  requested: {
    date:       { type: Date, default: null },
    slot:       { type: String, enum: ["morning", "afternoon", "evening", "custom", null], default: null },
    customSlot: { type: String, trim: true, default: null },
    message:    { type: String, trim: true, default: null },
  },

  // Signaux de qualification (§3) — déclarés par le client ou déduits.
  flags: {
    financing:        { type: Boolean, default: false },
    multipleVehicles: { type: Boolean, default: false },
    urgent:           { type: Boolean, default: false },
    international:    { type: Boolean, default: false },
    professional:     { type: Boolean, default: false },
  },

  qualification: {
    level:       { type: Number, enum: [1, 2, 3], default: 1 },
    reasons:     { type: [String], default: [] },
    qualifiedAt: { type: Date, default: null },
    qualifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Niveau 2 : transmis automatiquement à cette date si aucun admin n'a agi.
    autoSendAt:  { type: Date, default: null },
  },

  status: { type: String, enum: SALE_LEAD_STATUSES, default: "NEW", index: true },

  // Horodatages de jalons — rendent les statistiques (§16/§17) calculables
  // sans relire l'historique.
  milestones: {
    sentToPartnerAt:        { type: Date, default: null },
    partnerFirstResponseAt: { type: Date, default: null },
    scheduledAt:            { type: Date, default: null },
    completedAt:            { type: Date, default: null },
    interestedAt:           { type: Date, default: null },
    negotiationAt:          { type: Date, default: null },
    soldAt:                 { type: Date, default: null },
    lostAt:                 { type: Date, default: null },
  },

  // ── Rendez-vous confirmé ─────────────────────────────────────────────────
  appointment: {
    date:         { type: Date, default: null },
    time:         { type: String, default: null },
    endAt:        { type: Date, default: null },
    address:      { type: String, default: null },
    instructions: { type: String, default: null },
    confirmedAt:  { type: Date, default: null },
  },

  // ── Autre créneau proposé par le partenaire ──────────────────────────────
  alternative: {
    date:           { type: Date, default: null },
    slot:           { type: String, default: null },
    time:           { type: String, default: null },
    note:           { type: String, default: null },
    proposedAt:     { type: Date, default: null },
    clientResponse: { type: String, enum: ["pending", "accepted", "declined", null], default: null },
    respondedAt:    { type: Date, default: null },
  },

  // ── Délai de réponse partenaire (§7) ─────────────────────────────────────
  sla: {
    reminder1SentAt: { type: Date, default: null },
    reminder2SentAt: { type: Date, default: null },
    escalatedAt:     { type: Date, default: null },
    responseTimeMs:  { type: Number, default: null },
  },

  // ── Résultat déclaré par le partenaire (§9) ──────────────────────────────
  outcome: {
    requestedAt:    { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    adminAlertedAt: { type: Date, default: null },
    testDrive:   { type: String, enum: [...TEST_DRIVE_OUTCOMES, null], default: null },
    commercial:  { type: String, enum: [...COMMERCIAL_OUTCOMES, null], default: null },
    note:        { type: String, default: null },
    reportedAt:  { type: Date, default: null },
  },

  // ── Suivi automatique du client (§10) ────────────────────────────────────
  followUp: {
    sentAt:      { type: Date, default: null },
    response:    { type: String, enum: [...FOLLOW_UP_RESPONSES, null], default: null },
    respondedAt: { type: Date, default: null },
    remindAt:    { type: Date, default: null },
  },

  // ── Vente (§12) ──────────────────────────────────────────────────────────
  sale: {
    finalPrice:    { type: Number, default: null },
    currency:      { type: String, default: null },
    finalPriceUSD: { type: Number, default: null },
    soldAt:        { type: Date, default: null },
    declaredAt:    { type: Date, default: null },
    declaredBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt:   { type: Date, default: null },
    confirmedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectReason:  { type: String, default: null },
  },

  // ── Commission VIT AUTO (§13) ────────────────────────────────────────────
  commission: {
    rate:                 { type: Number, default: null },
    amountUSD:            { type: Number, default: null },
    dueWithinAttribution: { type: Boolean, default: null },
    ledgerId:             { type: mongoose.Schema.Types.ObjectId, ref: "CommissionLedger", default: null },
    computedAt:           { type: Date, default: null },
  },

  // ── Attribution (§14) ────────────────────────────────────────────────────
  attribution: {
    windowDays: { type: Number, default: 90 },
    expiresAt:  { type: Date, default: null },
  },

  // ── Confidentialité (§19) ────────────────────────────────────────────────
  contact: {
    disclosureStage:      { type: String, default: "PARTNER_ACCEPTED" },
    disclosedToPartnerAt: { type: Date, default: null },
  },

  history: { type: [historyEntry], default: [] },

  // Lien signé pour un client sans compte (consulter / répondre).
  clientAccessToken: { type: String, default: null, index: true },

  lostReason:    { type: String, default: null },
  cancelReason:  { type: String, default: null },
  cancelledBy:   { type: String, enum: ["client", "partner", "admin", "system", null], default: null },
  internalNotes: { type: String, default: null },
  partnerNotes:  { type: String, default: null },
  assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

salesLeadSchema.index({ partner: 1, status: 1, createdAt: -1 });
salesLeadSchema.index({ partner: 1, businessId: 1 });
salesLeadSchema.index({ status: 1, "milestones.sentToPartnerAt": 1 });
salesLeadSchema.index({ status: 1, "appointment.endAt": 1 });
salesLeadSchema.index({ "client.phone": 1, vehicle: 1 });
salesLeadSchema.index({ createdAt: -1 });

salesLeadSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  if (!this.clientAccessToken) this.clientAccessToken = crypto.randomBytes(24).toString("hex");
  next();
});

const SalesLead = mongoose.models.SalesLead || mongoose.model("SalesLead", salesLeadSchema);
export default SalesLead;
