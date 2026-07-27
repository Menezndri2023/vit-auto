import mongoose from "mongoose";

const leadSchema = new mongoose.Schema({
  // Partenaire qui reçoit le lead
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // Entreprise (PartnerBusiness) à laquelle rattacher ce lead — un partenaire
  // opérant plusieurs entités (voir PartnerBusiness.js) doit pouvoir séparer
  // son pipeline par entité. Optionnel : null = non rattaché (ancien lead, ou
  // partenaire mono-entité) et reste visible dans "Toutes les entités".
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerBusiness",
    default: null,
    index: true,
  },

  // Acheteur (optionnel si non inscrit)
  buyerId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Infos acheteur (remplies même si non inscrit)
  buyer: {
    name:        { type: String, trim: true, default: null },
    email:       { type: String, trim: true, default: null },
    phone:       { type: String, trim: true, default: null },
    whatsapp:    { type: String, trim: true, default: null },
    country:     { type: String, trim: true, default: null },
    city:        { type: String, trim: true, default: null },
    company:     { type: String, trim: true, default: null },
    language:    { type: String, trim: true, default: "fr" },
  },

  // Véhicule ciblé
  vehicle: {
    listingId:  { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
    make:       { type: String, trim: true, default: null },
    model:      { type: String, trim: true, default: null },
    year:       { type: Number, default: null },
    quantity:   { type: Number, default: 1 },
    conditions: { type: String, enum: ["neuf", "occasion", "indifferent"], default: "indifferent" },
    notes:      { type: String, default: null },
  },

  // Budget & financement
  budget: {
    min:      { type: Number, default: null },
    max:      { type: Number, default: null },
    currency: { type: String, default: "USD" },
    incoterm: { type: String, enum: ["FOB", "CIF", "EXW", "DAP", "autre", null], default: null },
    financing: { type: String, enum: ["cash", "credit", "lc", "wire", "autre", null], default: null },
  },

  // Destination
  destinationCountry: { type: String, trim: true, default: null },
  destinationPort:    { type: String, trim: true, default: null },

  // Source du lead
  source: {
    type: String,
    enum: ["website", "whatsapp", "email", "phone", "referral", "showroom", "import_export", "other"],
    default: "website",
  },

  // Statut de suivi
  status: {
    type: String,
    enum: ["nouveau", "contacte", "en_discussion", "devis_envoye", "negociation", "gagne", "perdu", "archive"],
    default: "nouveau",
  },

  // Score de priorité (calculé)
  score: { type: Number, default: 50, min: 0, max: 100 },
  urgency: { type: String, enum: ["faible", "moyen", "eleve", "urgent"], default: "moyen" },

  // Vendeur assigné (membre de l'équipe du partenaire)
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Devis associé
  quoteId: { type: mongoose.Schema.Types.ObjectId, ref: "Quote", default: null },

  // Suivi
  followUps: [{
    date:    { type: Date, default: Date.now },
    note:    { type: String, default: null },
    method:  { type: String, enum: ["phone", "email", "whatsapp", "meeting", "other"], default: "other" },
    outcome: { type: String, default: null },
    nextAction: { type: Date, default: null },
  }],

  // Messages / historique
  messages: [{
    from:      { type: String, enum: ["partner", "buyer"], required: true },
    text:      { type: String, default: null },
    sentAt:    { type: Date, default: Date.now },
    readAt:    { type: Date, default: null },
    channel:   { type: String, enum: ["platform", "email", "whatsapp"], default: "platform" },
  }],

  // Documents liés
  documents: [{
    name:    { type: String },
    url:     { type: String },
    type:    { type: String, enum: ["contrat", "devis", "facture", "inspection", "autre"], default: "autre" },
    addedAt: { type: Date, default: Date.now },
  }],

  // Notes internes partenaire
  internalNotes: { type: String, default: null },

  // Raison de perte
  lostReason: { type: String, default: null },

  // Dates
  firstContactAt: { type: Date, default: null },
  closedAt:       { type: Date, default: null },
  nextFollowUpAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

leadSchema.index({ partnerId: 1, status: 1 });
leadSchema.index({ partnerId: 1, createdAt: -1 });
leadSchema.index({ partnerId: 1, businessId: 1 });
leadSchema.index({ "buyer.email": 1 });

leadSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Lead = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
export default Lead;
