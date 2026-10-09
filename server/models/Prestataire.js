import mongoose from "mongoose";

// Prestataire de la zone Transit (2026-10-07) : fournisseur de VIT AUTO
// (transitaire, commissionnaire en douane, inspecteur, transporteur), pas un
// partenaire. Pas de profil public ; il ne voit que les dossiers d'import qui
// lui sont affectés. Inscription uniquement sur invitation (InvitationPrestataire).
export const TYPES_PRESTATAIRE = ["transitaire", "commissionnaire_douane", "inspecteur", "transporteur"];

const prestataireSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  raisonSociale: { type: String, required: true, trim: true, maxlength: 160 },
  types:         [{ type: String, enum: TYPES_PRESTATAIRE }],
  pays:          [{ type: String, trim: true, uppercase: true }],   // pays couverts (codes ISO)
  ports:         [{ type: String, trim: true, uppercase: true }],   // ports couverts (UN/LOCODE)
  telephone:     { type: String, trim: true, default: null },
  statut:        { type: String, enum: ["actif", "suspendu"], default: "actif" },
}, { timestamps: true });

const Prestataire = mongoose.models.Prestataire || mongoose.model("Prestataire", prestataireSchema);
export default Prestataire;
