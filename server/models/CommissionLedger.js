import mongoose from "mongoose";

const commissionLedgerSchema = new mongoose.Schema({
  // Transaction source
  transactionId:   { type: String, required: true },
  transactionType: {
    type: String,
    enum: ["booking", "sale", "import_export", "subscription", "driver_assignment"],
    required: true,
  },

  // Partenaire concerné
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Montant
  grossAmount:     { type: Number, required: true },   // montant total de la transaction
  commissionRate:  { type: Number, required: true },   // taux en % (ex: 10)
  commissionAmount:{ type: Number, required: true },   // montant net commission
  currency:        { type: String, default: "XOF" },

  // Type de commission
  type: {
    type: String,
    enum: [
      "platform_fee",        // Part plateforme VIT AUTO
      "partner_direct",      // Commission partenaire fondateur vente directe
      "partner_network",     // Commission réseau (2%)
      "driver_share",        // Part chauffeur (85%)
      "referral",            // Commission parrainage
    ],
    required: true,
  },

  status: {
    type: String,
    enum: ["pending", "confirmed", "paid", "disputed", "cancelled"],
    default: "pending",
  },

  confirmedAt: { type: Date, default: null },
  paidAt:      { type: Date, default: null },
  paidViaTxId: { type: String, default: null },  // ID transaction de virement

  notes: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

commissionLedgerSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

commissionLedgerSchema.index({ partnerId: 1, status: 1, createdAt: -1 });
// Unique — recordPartnerPayout (utils/commissionLedger.js) fait un upsert
// findOneAndUpdate({transactionId, transactionType}, ..., {upsert:true}) en
// s'appuyant sur cette paire pour ne jamais créer deux entrées pour la même
// commande. Sans contrainte unique en base, deux complétions concurrentes de
// la même réservation (double clic, requête rejouée) peuvent toutes deux
// passer le "not found" avant qu'aucune n'ait terminé d'écrire, créant deux
// entrées de reversement pour un seul montant réellement dû (bug réel trouvé
// en audit) — l'upsert seul ne garantit l'atomicité qu'avec cet index.
commissionLedgerSchema.index({ transactionId: 1, transactionType: 1 }, { unique: true });
commissionLedgerSchema.index({ status: 1, createdAt: -1 });

const CommissionLedger = mongoose.models.CommissionLedger || mongoose.model("CommissionLedger", commissionLedgerSchema);
export default CommissionLedger;
