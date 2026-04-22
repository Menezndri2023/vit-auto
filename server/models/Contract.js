import mongoose from "mongoose";

const contractSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },

  contractNumber: {
    type: String,
    unique: true,
  },

  type: {
    type: String,
    enum: ["location", "essai", "chauffeur"],
    required: true,
  },

  // Informations client
  client: {
    firstName:  { type: String },
    lastName:   { type: String },
    email:      { type: String },
    phone:      { type: String },
    idType:     { type: String, enum: ["cni", "passport", "permis"] },
    idNumber:   { type: String },
    address:    { type: String },
  },

  // Informations vendeur / partenaire
  vendor: {
    name:   { type: String },
    email:  { type: String },
    phone:  { type: String },
  },

  // Informations véhicule
  vehicle: {
    name:         { type: String },
    brand:        { type: String },
    year:         { type: Number },
    licensePlate: { type: String },
    color:        { type: String },
    mileage:      { type: Number },
  },

  // Conditions financières
  terms: {
    startDate:        { type: Date },
    endDate:          { type: Date },
    days:             { type: Number },
    pickupLocation:   { type: String },
    returnLocation:   { type: String },
    dailyRateXOF:     { type: Number },
    cautionXOF:       { type: Number, default: 200000 },  // 200 000 FCFA caution
    serviceFeeXOF:    { type: Number, default: 1000 },    // 1 000 FCFA frais plateforme
    optionsXOF:       { type: Number, default: 0 },
    baseXOF:          { type: Number },
    totalXOF:         { type: Number },
    commissionRate:   { type: Number },   // 0.15 ou 0.03
    commissionXOF:    { type: Number },
    partnerPayoutXOF: { type: Number },
  },

  // Conditions générales du contrat
  conditions: {
    type: String,
    default: [
      "1. Le locataire s'engage à restituer le véhicule dans l'état décrit au moment de la prise en charge.",
      "2. Tout dommage constaté sera imputé sur la caution versée.",
      "3. Le véhicule doit être restitué avec le même niveau d'essence.",
      "4. L'utilisation du véhicule hors du territoire national est interdite sauf accord écrit.",
      "5. En cas d'accident ou de panne, le locataire doit immédiatement contacter VIT AUTO.",
      "6. Le non-respect des présentes conditions entraîne la perte totale ou partielle de la caution.",
      "7. La vitesse maximale autorisée est celle indiquée par le code de la route local.",
      "8. Il est interdit de sous-louer le véhicule à un tiers.",
    ].join("\n"),
  },

  // Statut du contrat
  status: {
    type: String,
    enum: ["draft", "sent", "signed", "completed", "cancelled"],
    default: "draft",
  },

  // Signature électronique
  isSigned:        { type: Boolean, default: false },
  signedAt:        { type: Date },
  clientSignature: { type: String }, // base64 ou hash de confirmation

  createdAt: { type: Date, default: Date.now },
});

// Génération automatique du numéro de contrat
contractSchema.pre("save", async function (next) {
  if (!this.contractNumber) {
    const count = await mongoose.model("Contract").countDocuments();
    const year = new Date().getFullYear();
    this.contractNumber = `VIT-${year}-${String(count + 1).padStart(5, "0")}`;
  }
  next();
});

const Contract = mongoose.models.Contract || mongoose.model("Contract", contractSchema);
export default Contract;
