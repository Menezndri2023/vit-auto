import mongoose from "mongoose";

const quoteLineSchema = new mongoose.Schema({
  description: { type: String, required: true },
  qty:         { type: Number, default: 1 },
  unitPrice:   { type: Number, default: 0 },
  currency:    { type: String, default: "USD" },
  category: {
    type: String,
    enum: ["vehicule", "transport", "assurance", "inspection", "douane", "port", "livraison", "autre"],
    default: "autre",
  },
  included: { type: Boolean, default: true },
}, { _id: false });

const quoteSchema = new mongoose.Schema({
  // Numéro de devis unique
  quoteNumber: { type: String, required: true, unique: true },

  // Partenaire émetteur
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // Lead associé (optionnel)
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },

  // Acheteur
  buyer: {
    name:    { type: String, trim: true },
    email:   { type: String, trim: true },
    phone:   { type: String, trim: true },
    country: { type: String, trim: true },
    company: { type: String, trim: true },
  },

  // Véhicule(s)
  vehicles: [{
    make:      { type: String },
    model:     { type: String },
    year:      { type: Number },
    vin:       { type: String, default: null },
    color:     { type: String, default: null },
    quantity:  { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    currency:  { type: String, default: "USD" },
    condition: { type: String, default: "occasion" },
    photoUrl:  { type: String, default: null },
  }],

  // Lignes de devis détaillées
  lines: [quoteLineSchema],

  // Récapitulatif financier
  subtotal:         { type: Number, default: 0 },
  discount:         { type: Number, default: 0 },    // en %
  discountAmount:   { type: Number, default: 0 },
  taxRate:          { type: Number, default: 0 },    // en %
  taxAmount:        { type: Number, default: 0 },
  total:            { type: Number, default: 0 },
  currency:         { type: String, default: "USD" },

  // Incoterm & paiement
  incoterm:      { type: String, enum: ["FOB", "CIF", "EXW", "DAP", "autre"], default: "CIF" },
  paymentTerms:  { type: String, default: "30% acompte, 70% avant expédition" },
  paymentMethod: { type: String, default: "Virement SWIFT / L/C" },

  // Port d'expédition & destination
  portOfLoading:    { type: String, trim: true, default: null },
  portOfDischarge:  { type: String, trim: true, default: null },
  deliveryTime:     { type: String, default: "30-45 jours après paiement" },
  validityDays:     { type: Number, default: 30 },
  validUntil:       { type: Date, default: null },

  // Notes et conditions
  notes:         { type: String, default: null },
  conditions:    { type: String, default: null },

  // Statut
  status: {
    type: String,
    enum: ["brouillon", "envoye", "vu", "accepte", "refuse", "expire", "commande"],
    default: "brouillon",
  },

  // Suivi
  sentAt:     { type: Date, default: null },
  viewedAt:   { type: Date, default: null },
  answeredAt: { type: Date, default: null },

  // Révisions
  revision:   { type: Number, default: 1 },
  parentQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: "Quote", default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

quoteSchema.index({ partnerId: 1, status: 1 });
quoteSchema.index({ partnerId: 1, createdAt: -1 });
quoteSchema.index({ quoteNumber: 1 });

// Auto-génération numéro de devis
quoteSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  if (!this.quoteNumber) {
    const y = new Date().getFullYear().toString().slice(-2);
    const m = String(new Date().getMonth() + 1).padStart(2, "0");
    const r = Math.random().toString(36).toUpperCase().slice(2, 6);
    this.quoteNumber = `VA-${y}${m}-${r}`;
  }
  // Calcul validUntil si non défini
  if (!this.validUntil && this.validityDays) {
    const d = new Date(this.createdAt || Date.now());
    d.setDate(d.getDate() + this.validityDays);
    this.validUntil = d;
  }
  next();
});

const Quote = mongoose.models.Quote || mongoose.model("Quote", quoteSchema);
export default Quote;
