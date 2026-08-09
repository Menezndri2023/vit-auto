import mongoose from "mongoose";

// Pipeline de prospection commerciale des partenaires (concessionnaires,
// loueurs, assureurs, banques...) — distinct de server/models/Lead.js qui
// suit les clients acheteurs/loueurs DES partenaires, pas les partenaires
// eux-mêmes. Couvre le prospect pur (aucun compte VIT AUTO) jusqu'au
// partenaire fidèle, avec liaison optionnelle vers User/PartnerBusiness/
// PartnerOnboarding une fois le prospect réellement inscrit.
export const STATUT_PIPELINE = [
  "LEAD",
  "CONTACTE",
  "INTERESSE",
  "QUALIFIE",
  "NEGOCIATION",
  "INSCRIT",
  "ACTIF",
  "PREMIERE_TRANSACTION",
  "PARTENAIRE_FIDELE",
];

export const CONTACT_CHANNELS = ["whatsapp", "wechat", "email", "phone", "meeting", "other", ""];
export const PRIORITY_LEVELS = ["high", "medium", "low"];

const statusHistoryEntrySchema = new mongoose.Schema({
  statut:    { type: String, enum: STATUT_PIPELINE, required: true },
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { _id: false });

const partnerCrmSchema = new mongoose.Schema({
  referenceNumber: { type: String, unique: true, sparse: true },

  // ── Identité du prospect/partenaire ───────────────────────────────────────
  entreprise: { type: String, required: true, trim: true },
  pays:       { type: String, uppercase: true, trim: true, default: null },
  ville:      { type: String, trim: true, default: null },
  secteur:    { type: String, trim: true, default: null }, // texte libre : concessionnaire auto, assurance, banque...

  contactNom:   { type: String, trim: true, default: null },
  contactTel:   { type: String, trim: true, default: null },
  contactEmail: { type: String, trim: true, lowercase: true, default: null },
  website:      { type: String, trim: true, default: null },

  // ── Pipeline ───────────────────────────────────────────────────────────────
  statut:        { type: String, enum: STATUT_PIPELINE, default: "LEAD", index: true },
  statusHistory: [statusHistoryEntrySchema],

  // ── Documents & contrat ────────────────────────────────────────────────────
  documents: [{
    nom:        { type: String, trim: true },
    url:        { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  }],
  contrat: {
    reference:      { type: String, trim: true, default: null },
    dateSignature:  { type: Date, default: null },
    dateExpiration: { type: Date, default: null },
    url:            { type: String, trim: true, default: null },
  },

  services: { type: [String], default: [] }, // ex: location, vente, import_export, assurance

  commission: {
    taux:  { type: Number, default: null }, // %
    notes: { type: String, trim: true, default: null },
  },

  // Renseigné automatiquement à l'entrée dans le statut INSCRIT.
  dateInscription: { type: Date, default: null },

  // ── Suivi commercial — mêmes champs que PartnerOnboarding.adminCRM pour
  // rester cohérent avec la vue Founding Partners existante ──────────────────
  lastContactDate:    { type: Date, default: null },
  lastContactChannel: { type: String, enum: CONTACT_CHANNELS, default: "" },
  nextFollowUpDate:   { type: Date, default: null },
  priority:           { type: String, enum: PRIORITY_LEVELS, default: "medium" },
  internalNotes:      { type: String, trim: true, default: "" },
  source:             { type: String, trim: true, default: null }, // salon, recommandation, prospection directe...

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // responsable commercial

  // ── Liaison vers le vrai compte une fois le prospect inscrit ─────────────────
  linkedUserId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  linkedBusinessId:   { type: mongoose.Schema.Types.ObjectId, ref: "PartnerBusiness", default: null },
  linkedOnboardingId: { type: mongoose.Schema.Types.ObjectId, ref: "PartnerOnboarding", default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Même pattern que PartnerOnboarding.js : dernier numéro de l'année courante
// plutôt qu'un countDocuments() non-atomique, unicité garantie par l'index.
partnerCrmSchema.pre("save", async function (next) {
  if (!this.referenceNumber) {
    const year = new Date().getFullYear();
    const prefix = `VA-CRM-${year}-`;
    const last = await mongoose.model("PartnerCrm")
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

partnerCrmSchema.index({ pays: 1, statut: 1 });
partnerCrmSchema.index({ assignedTo: 1 });
partnerCrmSchema.index({ contactEmail: 1 });
partnerCrmSchema.index({ createdAt: -1 });

const PartnerCrm =
  mongoose.models.PartnerCrm || mongoose.model("PartnerCrm", partnerCrmSchema);

export default PartnerCrm;
