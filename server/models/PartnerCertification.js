import mongoose from "mongoose";

const docSchema = new mongoose.Schema({
  name:       { type: String, default: null },
  data:       { type: String, default: null },
  uploadedAt: { type: Date,   default: null },
}, { _id: false });

const levelMeta = {
  status: {
    type: String,
    enum: ["not_started", "in_progress", "submitted", "approved", "rejected"],
    default: "not_started",
  },
  submittedAt:     { type: Date,   default: null },
  reviewedAt:      { type: Date,   default: null },
  adminNote:       { type: String, default: null },
  rejectionReason: { type: String, default: null },
};

const partnerCertificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  overallStatus: {
    type: String,
    enum: ["not_started", "in_progress", "pending_review", "approved", "rejected", "suspended"],
    default: "not_started",
  },

  certificationBadge: {
    type: String,
    enum: ["none", "verifie", "fondateur", "premium"],
    default: "none",
  },

  certificationScore: { type: Number, default: 0 },

  // ── Niveau 1 : Vérification entreprise ────────────────────────────────────
  level1: {
    ...levelMeta,
    companyName:       { type: String, default: null },
    legalForm:         { type: String, default: null },
    country:           { type: String, default: null },
    registrationType: {
      type: String,
      enum: ["rccm", "kbis", "business_license", "trade_license", "other", null],
      default: null,
    },
    registrationNumber: { type: String, default: null },
    taxId:              { type: String, default: null },
    officialAddress:    { type: String, default: null },
    city:               { type: String, default: null },
    website:            { type: String, default: null },
    businessEmail:      { type: String, default: null },
    registrationDoc:    { type: docSchema, default: {} },
    taxDoc:             { type: docSchema, default: {} },
    addressProofDoc:    { type: docSchema, default: {} },
  },

  // ── Niveau 2 : Vérification représentant ──────────────────────────────────
  level2: {
    ...levelMeta,
    repFirstName: { type: String, default: null },
    repLastName:  { type: String, default: null },
    repFunction:  { type: String, default: null },
    repIdType:    { type: String, enum: ["passport", "cni", "sejour", null], default: null },
    repIdNumber:  { type: String, default: null },
    hasProfCard:  { type: Boolean, default: false },
    videoCallDone: { type: Boolean, default: false },
    videoCallDate: { type: Date,    default: null },
    idFrontDoc:   { type: docSchema, default: {} },
    idBackDoc:    { type: docSchema, default: {} },
    selfieDoc:    { type: docSchema, default: {} },
    profCardDoc:  { type: docSchema, default: {} },
  },

  // ── Niveau 3 : Vérification commerciale ───────────────────────────────────
  level3: {
    ...levelMeta,
    yearsExperience:   { type: Number,   default: 0 },
    exportCountries:   { type: [String], default: [] },
    monthlyVolume:     { type: String,   default: null },
    portsUsed:         { type: [String], default: [] },
    paymentMethods:    { type: [String], default: [] },
    averageDelay:      { type: String,   default: null },
    activityTypes:     { type: [String], default: [] },
    vehicleCategories: { type: [String], default: [] },
  },

  // ── Niveau 4 : Vérification bancaire ──────────────────────────────────────
  level4: {
    ...levelMeta,
    bankName:      { type: String, default: null },
    accountHolder: { type: String, default: null },
    iban:          { type: String, default: null },
    swift:         { type: String, default: null },
    bankCountry:   { type: String, default: null },
    bankDoc:       { type: docSchema, default: {} },
  },

  // ── Niveau 5 : Vérification véhicules ─────────────────────────────────────
  level5: {
    ...levelMeta,
    make:          { type: String,  default: null },
    model:         { type: String,  default: null },
    year:          { type: Number,  default: null },
    vin:           { type: String,  default: null },
    mileage:       { type: Number,  default: null },
    hasVideo:      { type: Boolean, default: false },
    hasInspection: { type: Boolean, default: false },
    hasHistory:    { type: Boolean, default: false },
    grayCardDoc:   { type: docSchema, default: {} },
    photoDoc:      { type: docSchema, default: {} },
    invoiceDoc:    { type: docSchema, default: {} },
  },

  // ── Niveau 6 : Documents export ───────────────────────────────────────────
  level6: {
    ...levelMeta,
    canProvideProforma:        { type: Boolean, default: false },
    canProvideCommercialInvoice: { type: Boolean, default: false },
    canProvidePackingList:     { type: Boolean, default: false },
    canProvideBillOfLading:    { type: Boolean, default: false },
    canProvideOriginCert:      { type: Boolean, default: false },
    canProvideInspectionCert:  { type: Boolean, default: false },
    canProvideCustomsDocs:     { type: Boolean, default: false },
    sampleDoc:                 { type: docSchema, default: {} },
  },

  // ── Niveau 7 : Contrat Partenaire Fondateur ────────────────────────────────
  level7: {
    ...levelMeta,
    agreedToGCU:       { type: Boolean, default: false },
    agreedToCharte:    { type: Boolean, default: false },
    agreedToAntifraud: { type: Boolean, default: false },
    agreedToDelays:    { type: Boolean, default: false },
    agreedToDataProt:  { type: Boolean, default: false },
    agreedToRefund:    { type: Boolean, default: false },
    signedAt:          { type: Date,   default: null },
    signerIp:          { type: String, default: null },
  },

  // ── Niveau 8 : Badge final (admin) ────────────────────────────────────────
  level8: {
    ...levelMeta,
    badgeAwarded:    { type: String, enum: ["none", "verifie", "fondateur", "premium"], default: "none" },
    awardedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    awardedAt:       { type: Date,   default: null },
    publicStatement: { type: String, default: null },
  },

  // ── Audit log ─────────────────────────────────────────────────────────────
  auditLog: [{
    action:      { type: String, required: true },
    level:       { type: Number, default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note:        { type: String, default: null },
    timestamp:   { type: Date,   default: Date.now },
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

partnerCertificationSchema.index({ userId: 1 });
partnerCertificationSchema.index({ overallStatus: 1 });
partnerCertificationSchema.index({ certificationBadge: 1 });

partnerCertificationSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const PartnerCertification =
  mongoose.models.PartnerCertification ||
  mongoose.model("PartnerCertification", partnerCertificationSchema);

export default PartnerCertification;
