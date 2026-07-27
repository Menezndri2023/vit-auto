import mongoose from "mongoose";

const invoiceLineSchema = new mongoose.Schema({
  booking:            { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  bookingRef:         { type: String },
  serviceType:        { type: String },  // location | essai | chauffeur | leasing
  montantTransaction: { type: Number, default: 0 },
  commissionRate:     { type: Number, default: 0 },
  commissionAmount:   { type: Number, default: 0 },
  devise:             { type: String, default: "USD" },
  completedAt:        { type: Date },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  reference:       { type: String, unique: true },
  partner:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // Entreprise (PartnerBusiness) facturée — null = facture "historique"
  // regroupant tous les véhicules/chauffeurs SANS entité assignée (voir
  // Vehicle.business/Driver.business), ce qui reproduit exactement l'ancien
  // comportement (une facture par partenaire/mois) pour tout partenaire
  // n'utilisant pas le multi-entité. Un partenaire à plusieurs entités reçoit
  // une facture PAR ENTITÉ et par mois (voir invoiceController — le champ
  // null compte comme une valeur à part entière dans l'index unique
  // ci-dessous, donc un seul "bucket sans entité" par mois, et un par entité).
  businessId:      { type: mongoose.Schema.Types.ObjectId, ref: "PartnerBusiness", default: null },

  month:           { type: Number, required: true, min: 1, max: 12 },
  year:            { type: Number, required: true },
  lines:           [invoiceLineSchema],
  totalCommission: { type: Number, default: 0 },
  devise:          { type: String, default: "USD" },
  status: {
    type: String,
    enum: ["pending", "paid", "overdue"],
    default: "pending",
  },
  dueDate:       { type: Date },
  paidAt:        { type: Date, default: null },
  paymentMethod: { type: String, default: null },
  notes:         { type: String, default: null },
  createdAt:     { type: Date, default: Date.now },
  updatedAt:     { type: Date, default: Date.now },
});

// Remplace l'ancien index unique { partner, year, month } (voir
// scripts/migrateInvoiceBusinessIndex.js — à lancer manuellement en
// production après déploiement de ce schéma pour supprimer l'ancien index,
// qui sinon continuerait à bloquer la création d'une 2e facture pour le même
// partenaire/mois dès qu'une entité distincte est facturée séparément).
invoiceSchema.index({ partner: 1, businessId: 1, year: 1, month: 1 }, { unique: true });
invoiceSchema.index({ status: 1 });

invoiceSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
export default Invoice;
