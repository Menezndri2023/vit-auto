import mongoose from "mongoose";

// Barème douanier/logistique configuré par l'admin, un document par PAYS DE
// DESTINATION (nom de pays, même convention que ImportExportListing.sourceCountry/
// availableIn — chaîne libre suggérée par datalist, pas un enum ISO strict).
// Tous les montants fixes sont saisis en USD (devise de référence du moteur de
// calcul, voir server/utils/exchangeRates.js) puis convertis à l'affichage
// dans la devise de l'annonce/transaction concernée.
//
// Simplification volontaire du barème réel (douane variable selon l'âge du
// véhicule, la cylindrée, la valeur CIF précise...) : v1 applique un taux fixe
// par pays. Un raffinement par tranche d'âge/cylindrée est un chantier futur,
// pas un objectif de cette première version.
const importCostConfigSchema = new mongoose.Schema({
  country: { type: String, required: true, unique: true, trim: true },

  // ── Douane / fiscalité import ──────────────────────────────────────────
  customsDutyPercent: { type: Number, default: 20 },   // % appliqué sur la base CIF (prix + fret + assurance)
  vatPercent:         { type: Number, default: 18 },   // % appliqué sur (CIF + droits de douane)
  transitFixedFeeUSD: { type: Number, default: 150 },  // frais de transit/dédouanement fixes
  redevancesFixedFeeUSD: { type: Number, default: 100 }, // redevances diverses (statistique, informatique...)

  // ── Frais portuaires & livraison (côté destination) ────────────────────
  portFeesFixedUSD:      { type: Number, default: 300 },
  deliveryFixedFeeUSD:   { type: Number, default: 200 }, // port → ville principale

  // ── Assurance maritime ──────────────────────────────────────────────────
  insurancePercent: { type: Number, default: 1 }, // % de la valeur du véhicule

  // ── Fret maritime par défaut (utilisé si aucune ShippingLaneRate exacte
  // n'est configurée pour la paire origine/destination) ──────────────────
  defaultSeaFreightUSD: { type: Number, default: 1200 },

  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const ImportCostConfig = mongoose.models.ImportCostConfig || mongoose.model("ImportCostConfig", importCostConfigSchema);
export default ImportCostConfig;
