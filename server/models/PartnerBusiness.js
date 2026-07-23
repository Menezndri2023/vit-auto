import mongoose from "mongoose";

// Un partenaire peut opérer plusieurs entreprises domiciliées à des endroits
// différents (parfois dans des pays différents) — chacune avec sa propre
// identité de contact et localisation, choisie au moment de publier un
// véhicule (voir vehicleController.createVehicle) pour que l'annonce hérite
// automatiquement du bon pays/ville/adresse au lieu du User.country unique.
const partnerBusinessSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  companyName: { type: String, trim: true, required: true },

  // Code ISO-2 (cf CountryConfig) — sert à préremplir Vehicle.country.
  country: { type: String, uppercase: true, trim: true, required: true },
  ville:   { type: String, trim: true, required: true },
  adresse: { type: String, trim: true, default: null },
  coordonnees: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },

  contactNom: { type: String, trim: true, default: null },
  contactTel: { type: String, trim: true, default: null },

  // Une seule entreprise par défaut par partenaire — préremplit le formulaire
  // de publication quand aucune n'est explicitement choisie.
  isDefault: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

partnerBusinessSchema.index({ owner: 1, createdAt: 1 });

partnerBusinessSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const PartnerBusiness =
  mongoose.models.PartnerBusiness ||
  mongoose.model("PartnerBusiness", partnerBusinessSchema);

export default PartnerBusiness;
