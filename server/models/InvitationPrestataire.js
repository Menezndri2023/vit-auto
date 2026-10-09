import mongoose from "mongoose";
import { TYPES_PRESTATAIRE } from "./Prestataire.js";

// Invitation à rejoindre la zone Transit : lien à usage unique, valable 7 jours,
// envoyé par l'admin à l'adresse du prestataire. Seul le HACHÉ du jeton est
// stocké ; l'inscription n'est possible qu'avec un jeton valide, jamais ouverte
// au public.
const invitationSchema = new mongoose.Schema({
  email:         { type: String, required: true, lowercase: true, trim: true },
  raisonSociale: { type: String, required: true, trim: true, maxlength: 160 },
  types:         [{ type: String, enum: TYPES_PRESTATAIRE }],
  pays:          [{ type: String, trim: true, uppercase: true }],
  ports:         [{ type: String, trim: true, uppercase: true }],
  jetonHache:    { type: String, required: true, unique: true },
  expireLe:      { type: Date, required: true },
  utiliseeLe:    { type: Date, default: null },
  revoqueeLe:    { type: Date, default: null },
  creePar:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  compte:        { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const InvitationPrestataire = mongoose.models.InvitationPrestataire || mongoose.model("InvitationPrestataire", invitationSchema);
export default InvitationPrestataire;
