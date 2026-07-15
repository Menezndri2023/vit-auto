import mongoose from "mongoose";

const auditEntrySchema = new mongoose.Schema({
  action:      { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  note:        { type: String, default: "" },
  timestamp:   { type: Date, default: Date.now },
}, { _id: false });

const partnerOnboardingSchema = new mongoose.Schema({
  // ── Référence unique VA-FP-YYYY-NNN ──────────────────────────────────────
  referenceNumber: { type: String, unique: true, sparse: true },

  // ── Lien utilisateur ──────────────────────────────────────────────────────
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  // Pays dénormalisé depuis User.country au moment de la candidature (voir
  // applyToProgram) — la limite des 20 Founding Partners se compte PAR PAYS,
  // pas globalement : dénormaliser évite un $lookup sur User à chaque comptage.
  country: { type: String, uppercase: true, default: null },

  // ── Statut du flux d'onboarding ───────────────────────────────────────────
  status: {
    type: String,
    enum: [
      "brouillon",     // En cours de remplissage
      "soumis",        // Soumis pour review admin
      "en_review",     // Admin en train d'examiner
      "loi_envoyee",   // LOI générée et envoyée au partenaire
      "loi_signee",    // LOI signée par le partenaire
      "accord_envoye", // Founding Partner Agreement envoyé
      "accord_signe",  // Agreement signé → activation
      "actif",         // Partenaire Fondateur actif
      "rejete",        // Dossier rejeté
      "info_demandee", // Informations complémentaires requises
    ],
    default: "brouillon",
  },

  // ── Type de partenaire ────────────────────────────────────────────────────
  partnerType: {
    type: String,
    enum: [
      "agence_location",
      "concessionnaire",
      "importateur_exportateur",
      "chauffeur_professionnel",
      "expert_auto",
      "transitaire_logistique",
      "financement",
      "assurance",
      "inspecteur_vehicles",
    ],
    default: "concessionnaire",
  },

  // Vrai uniquement une fois l'Accord signé (voir signAgreement) — pas dès la création
  // du dossier, sinon le badge "🌟 FP" affiché dans l'admin (AdminPanel.jsx) apparaît
  // même sur des brouillons jamais soumis ni examinés.
  isFoundingPartner: { type: Boolean, default: false },

  // ── Acceptation électronique des documents légaux (LOI, Agreement, Verification Policy) ──
  legalAcceptance: {
    accepted:   { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    ip:         { type: String, default: null },
  },

  // ── Commissions (verrouillées à la signature) ─────────────────────────────
  // Deux paliers dans le temps pour location/vente, décomptés depuis lockedAt —
  // voir server/utils/foundingPartnerRates.js (seule source de vérité pour le
  // taux réellement appliqué aux réservations, via bookingController.js) :
  //   Année 1 (0-12 mois depuis signature) : location 5%, vente 1%
  //   Année 2+ (au-delà)                    : location 7%, vente 2%
  // Les valeurs stockées ici reflètent le taux Année 1 (standard : 15%/3%) —
  // affichées dans la LOI/l'Agreement, mais jamais relues par le moteur de
  // commission (qui recalcule via foundingRateFor à partir de lockedAt).
  commissions: {
    location:  { type: Number, default: 5 },
    vente:     { type: Number, default: 1 },
    chauffeur: { type: Number, default: 10 },   // 10% identique, aucun palier
    lockedAt:  { type: Date, default: null },
  },

  // ── SECTION 1 : Informations entreprise (VA-FP-001) ──────────────────────
  companyInfo: {
    legalName:           { type: String, trim: true, default: "" },
    registrationNumber:  { type: String, trim: true, default: "" },
    incorporationDate:   { type: Date, default: null },
    registrationCountry: { type: String, trim: true, default: "" },
    address:             { type: String, trim: true, default: "" },
    website:             { type: String, trim: true, default: "" },
    email:               { type: String, trim: true, default: "" },
    phone:               { type: String, trim: true, default: "" },
    whatsapp:            { type: String, trim: true, default: "" },
    wechat:              { type: String, trim: true, default: "" },
    mainContact:         { type: String, trim: true, default: "" },
    mainContactPosition: { type: String, trim: true, default: "" },
  },

  // ── SECTION 2 : Documents légaux (base64 ou URL) ──────────────────────────
  legalDocs: {
    businessRegistration: { type: String, default: null },
    businessLicense:      { type: String, default: null },
    exportLicense:        { type: String, default: null },
    taxCertificate:       { type: String, default: null },
    proofOfAddress:       { type: String, default: null },
  },

  // ── SECTION 3 : Vérification commerciale ──────────────────────────────────
  businessVerification: {
    companyPresentation:  { type: String, default: null },
    brands:               { type: [String], default: [] },
    mainActivities:       { type: [String], default: [] },
    exportMarkets:        { type: [String], default: [] },
    annualExportCapacity: { type: String, default: "" },
    yearsExperience:      { type: Number, default: 0 },
    oemAuthorization:     { type: String, default: null },
    // Types d'entité (peuvent en cumuler plusieurs : usine + exportateur, etc.)
    entityTypes:          { type: [String], enum: ["factory", "dealer", "exporter", "importer", "agent"], default: [] },
  },

  // ── SECTION 4 : Médias pour intégration plateforme ────────────────────────
  platformMedia: {
    logo:             { type: String, default: null },
    companyPhotos:    { type: [String], default: [] },
    officePhotos:     { type: [String], default: [] },
    showroomPhotos:   { type: [String], default: [] },
    warehousePhotos:  { type: [String], default: [] },
    teamPhotos:       { type: [String], default: [] },
    promotionalVideo: { type: String, default: null },
  },

  // ── SECTION 5 : Inventaire véhicules ──────────────────────────────────────
  vehicleInventory: {
    newVehicles:        { type: Boolean, default: false },
    usedVehicles:       { type: Boolean, default: false },
    electricVehicles:   { type: Boolean, default: false },
    hybridVehicles:     { type: Boolean, default: false },
    luxuryVehicles:     { type: Boolean, default: false },
    commercialVehicles: { type: Boolean, default: false },
  },

  // ── SECTION 6 : Capacités d'export ────────────────────────────────────────
  exportCapabilities: {
    shippingPorts:    { type: [String], default: [] },
    shippingMethods:  { type: [String], default: [] },
    shippingPartners: { type: [String], default: [] },
    incoterms: {
      exw: { type: Boolean, default: false },
      fob: { type: Boolean, default: false },
      cif: { type: Boolean, default: false },
      dap: { type: Boolean, default: false },
      ddp: { type: Boolean, default: false },
    },
  },

  // ── SECTION 7 : Informations de paiement ──────────────────────────────────
  paymentInfo: {
    acceptedMethods:   { type: [String], default: [] },
    bankName:          { type: String, default: "" },
    preferredCurrency: { type: String, default: "" },
  },

  // ── SECTION 8 : Conditions commerciales (structurées) ─────────────────────
  commercialTerms: {
    minimumOrderQuantity: { type: String, default: "" },
    // Acompte
    depositPercentage:    { type: Number, default: null },   // 10 / 20 / 30 / 40 / 50
    depositTiming:        { type: String, default: "" },     // before_shipment / after_inspection / at_boarding / at_reception
    // Délai de livraison
    deliveryDays:         { type: Number, default: null },   // 15 / 30 / 45 / 60
    // Garantie
    warrantyAvailable:    { type: Boolean, default: null },
    warrantyMonths:       { type: Number, default: null },
    // Inspection
    inspectionType:       { type: String, default: "" },     // mandatory / optional / none
    inspectionAgency:     { type: String, default: "" },     // sgs / bureau_veritas / tuv / other
    // Paiement (multi-sélection)
    paymentModes:         { type: [String], default: [] },   // wire_transfer / lc / tt / cash / escrow
  },

  // ── CRM Admin (Founding Partners Directory) ───────────────────────────────
  adminCRM: {
    crmStatus:          { type: String, enum: ["interested", "reserved", "verified", "active", "inactive"], default: "interested" },
    lastContactDate:    { type: Date, default: null },
    lastContactChannel: { type: String, enum: ["whatsapp", "wechat", "email", "phone", "meeting", "other", ""], default: "" },
    nextFollowUpDate:   { type: Date, default: null },
    internalNotes:      { type: String, default: "" },
    priority:           { type: String, enum: ["high", "medium", "low"], default: "medium" },
    assignedTo:         { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // ── LOI (Letter of Intent) ────────────────────────────────────────────────
  loi: {
    content:            { type: String, default: null },
    sentAt:             { type: Date, default: null },
    signedAt:           { type: Date, default: null },
    signerName:         { type: String, default: "" },
    signerPosition:     { type: String, default: "" },
    signatureIp:        { type: String, default: null },
    signatureUserAgent: { type: String, default: null },
    documentHash:       { type: String, default: null }, // SHA-256 du contenu au moment de la signature
    signingToken:       { type: String, default: null }, // token URL sécurisé (64 hex)
    signingTokenExpires:{ type: Date,   default: null },
  },

  // ── Founding Partner Agreement ────────────────────────────────────────────
  agreement: {
    content:            { type: String, default: null },
    sentAt:             { type: Date, default: null },
    signedAt:           { type: Date, default: null },
    signerName:         { type: String, default: "" },
    signerPosition:     { type: String, default: "" },
    signatureIp:        { type: String, default: null },
    signatureUserAgent: { type: String, default: null },
    documentHash:       { type: String, default: null }, // SHA-256 du contenu au moment de la signature
    signingToken:       { type: String, default: null }, // token URL sécurisé (64 hex)
    signingTokenExpires:{ type: Date,   default: null },
  },

  // ── Revue admin ───────────────────────────────────────────────────────────
  adminReview: {
    reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt:    { type: Date, default: null },
    decision:      { type: String, enum: ["approved", "rejected", "info_requested", null], default: null },
    note:          { type: String, default: "" },
    infoRequested: { type: String, default: "" },
  },

  // ── Audit log ──────────────────────────────────────────────────────────────
  auditLog: [auditEntrySchema],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ── Auto-génération numéro de référence ───────────────────────────────────────
// Utilise le dernier numéro existant pour l'année courante (tri lexicographique
// sur le suffix zéro-padé), plus robuste qu'un countDocuments() non-atomique.
// L'unicité est de toute façon garantie par l'index unique sur referenceNumber.
partnerOnboardingSchema.pre("save", async function (next) {
  if (!this.referenceNumber) {
    const year = new Date().getFullYear();
    const prefix = `VA-FP-${year}-`;
    const last = await mongoose.model("PartnerOnboarding")
      .findOne({ referenceNumber: { $regex: `^${prefix}` } })
      .sort({ referenceNumber: -1 })
      .select("referenceNumber")
      .lean();
    let seq = 1;
    if (last?.referenceNumber) {
      const n = parseInt(last.referenceNumber.slice(prefix.length), 10);
      if (!isNaN(n)) seq = n + 1;
    }
    this.referenceNumber = `${prefix}${String(seq).padStart(3, "0")}`;
  }
  this.updatedAt = new Date();
  next();
});

// ── Calcul % de complétion (virtual) ─────────────────────────────────────────
partnerOnboardingSchema.virtual("completionPercent").get(function () {
  const checks = [
    !!(this.companyInfo?.legalName && this.companyInfo?.registrationNumber),
    !!(this.legalDocs?.businessRegistration || this.legalDocs?.businessLicense),
    !!(this.businessVerification?.brands?.length > 0),
    !!(this.platformMedia?.logo),
    !!(Object.values(this.vehicleInventory?.toObject?.() || {}).some(Boolean)),
    !!(this.exportCapabilities?.shippingPorts?.length > 0),
    !!(this.commercialTerms?.paymentModes?.length > 0),
    !!(this.commercialTerms?.deliveryDays),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
});

partnerOnboardingSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    // Ne jamais exposer les tokens de signature dans les réponses API
    if (ret.loi) {
      delete ret.loi.signingToken;
      delete ret.loi.signingTokenExpires;
    }
    if (ret.agreement) {
      delete ret.agreement.signingToken;
      delete ret.agreement.signingTokenExpires;
    }
    return ret;
  },
});
// toObject doit avoir le même transform que toJSON (ils sont indépendants)
partnerOnboardingSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => {
    if (ret.loi) {
      delete ret.loi.signingToken;
      delete ret.loi.signingTokenExpires;
    }
    if (ret.agreement) {
      delete ret.agreement.signingToken;
      delete ret.agreement.signingTokenExpires;
    }
    return ret;
  },
});

partnerOnboardingSchema.index({ status: 1 });
partnerOnboardingSchema.index({ isFoundingPartner: 1 });
partnerOnboardingSchema.index({ createdAt: -1 });
// Comptage rapide de la limite des 20 Founding Partners PAR PAYS (voir
// checkFoundingCapacity dans partnerOnboardingController.js).
partnerOnboardingSchema.index({ country: 1, status: 1 });
// Index pour recherche rapide par token de signature (sparse = ignore les null)
partnerOnboardingSchema.index({ "loi.signingToken": 1 },       { sparse: true });
partnerOnboardingSchema.index({ "agreement.signingToken": 1 }, { sparse: true });

const PartnerOnboarding =
  mongoose.models.PartnerOnboarding ||
  mongoose.model("PartnerOnboarding", partnerOnboardingSchema);

export default PartnerOnboarding;
