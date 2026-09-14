import mongoose from "mongoose";
import { ACTIVITIES } from "../constants/partnerTaxonomy.js";

// ── Demande d'ajout d'un secteur d'activité à un compte partenaire ─────────
//
// Un secteur (location, vente, export, chauffeur, loisirs) est une identité
// validée par l'administration — jamais un bouton que le partenaire coche
// seul : un exportateur porte une charge documentaire qu'un loueur n'a pas.
// Le plan, lui, fixe combien de secteurs un compte peut cumuler (voir
// planFeatures.PLAN_SECTEURS) ; cette limite est vérifiée à la demande ET à
// l'approbation, car le plan a pu changer entre les deux.
const partnerSectorRequestSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  secteur: { type: String, enum: ACTIVITIES, required: true },
  // Ce que le partenaire compte y publier — c'est ce que l'administration lit
  // pour juger la demande, avec les documents déjà au dossier.
  motif:   { type: String, trim: true, maxlength: 1000, default: "" },
  status:  { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  // Motif du refus, montré au partenaire : un refus sans raison ne lui laisse
  // aucune action possible.
  note:    { type: String, trim: true, maxlength: 1000, default: "" },
}, { timestamps: true });

// Une seule demande EN ATTENTE par compte et par secteur.
partnerSectorRequestSchema.index({ user: 1, secteur: 1, status: 1 });

export default mongoose.model("PartnerSectorRequest", partnerSectorRequestSchema);
