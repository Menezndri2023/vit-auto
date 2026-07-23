import mongoose from "mongoose";

// Facture PAR PRESTATION envoyée au partenaire juste après qu'une commande
// passe à "completed" — distincte de Invoice.js (facture MENSUELLE agrégée
// que le partenaire doit à VIT AUTO au titre de la commission). Ici c'est
// l'inverse : un document remis au partenaire documentant ce qu'il a
// effectivement encaissé/à percevoir pour CETTE prestation précise (montant
// brut, commission prélevée, net à percevoir, moyen de paiement utilisé —
// carte, mobile money, virement ou espèces).
const serviceInvoiceSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
    unique: true,
  },
  reference: { type: String, unique: true },

  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  serviceType: { type: String }, // location | essai | chauffeur | leasing (Booking.type)
  bookingReference: { type: String },

  grossAmount:     { type: Number, default: 0 },
  commissionRate:  { type: Number, default: 0 },
  commissionAmount:{ type: Number, default: 0 },
  netPayout:       { type: Number, default: 0 },
  currency:        { type: String, default: "USD" },

  // cash | card | orange_money | wave | mtn | moov | virement | ... — voir
  // bookingController.resolveBookingPaymentMethod pour la résolution.
  paymentMethod: { type: String, default: null },

  serviceCompletedAt: { type: Date, default: Date.now },
  sentAt:             { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

serviceInvoiceSchema.index({ partner: 1, createdAt: -1 });

const ServiceInvoice =
  mongoose.models.ServiceInvoice ||
  mongoose.model("ServiceInvoice", serviceInvoiceSchema);

export default ServiceInvoice;
