import mongoose from "mongoose";

// Tarif de fret configuré par l'admin pour une liaison PAYS D'ORIGINE → PAYS
// DE DESTINATION précise (ex. Chine → Côte d'Ivoire). Si aucune liaison exacte
// n'existe pour une annonce, le moteur de calcul retombe sur
// ImportCostConfig(destCountry).defaultSeaFreightUSD (estimation générique).
// Montants en USD (voir server/utils/exchangeRates.js).
const shippingLaneRateSchema = new mongoose.Schema({
  sourceCountry: { type: String, required: true, trim: true },
  destCountry:   { type: String, required: true, trim: true },

  seaFreightUSD:        { type: Number, required: true }, // port à port
  inlandTransportUSD:   { type: Number, default: 150 },   // garage → port de départ (pays d'origine)
  carrier:              { type: String, default: null },  // compagnie maritime (informatif)
  estimatedDelayDays:   { type: Number, default: null },

  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

shippingLaneRateSchema.index({ sourceCountry: 1, destCountry: 1 }, { unique: true });

const ShippingLaneRate = mongoose.models.ShippingLaneRate || mongoose.model("ShippingLaneRate", shippingLaneRateSchema);
export default ShippingLaneRate;
