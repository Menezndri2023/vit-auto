import mongoose from "mongoose";
import { INCOTERM_CODES } from "../../constants/incoterms.js";

// Conditions Incoterms® convenues sur une commande commerciale (transaction
// VIT-AUTO Trade ou commande Parts) — exploitant, 2026-10-28. La commande
// reste la référence commerciale ; un dossier logistique n'en garde qu'une
// copie informative.
//
// Accord = validation par l'acheteur ET par le vendeur. Toute modification
// remet les deux validations à zéro (celle de son auteur est reposée), exige
// un motif une fois l'accord obtenu, et s'inscrit dans l'historique.

const historiqueSchema = new mongoose.Schema({
  regle:     { type: String, default: null },
  lieuNomme: { type: String, default: null },
  pays:      { type: String, default: null },
  version:   { type: String, default: "2020" },
  action:    { type: String, enum: ["proposition", "modification", "validation"], required: true },
  role:      { type: String, enum: ["acheteur", "vendeur"], required: true },
  par:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  motif:     { type: String, trim: true, maxlength: 500, default: "" },
  le:        { type: Date, default: Date.now },
}, { _id: false });

const validationSchema = new mongoose.Schema({
  par: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  le:  { type: Date, default: null },
}, { _id: false });

export const conditionsIncotermSchema = new mongoose.Schema({
  regle:            { type: String, enum: [...INCOTERM_CODES, null], default: null },
  version:          { type: String, enum: ["2020"], default: "2020" },
  // Lieu ou port PRÉCISÉMENT nommé — jamais « FOB » seul.
  lieuNomme:        { type: String, trim: true, maxlength: 160, default: null },
  pays:             { type: String, uppercase: true, trim: true, maxlength: 2, default: null },
  modeTransport:    { type: String, enum: ["maritime", "routier", "aerien", "ferroviaire", "multimodal", null], default: null },
  referenceDevis:   { type: String, trim: true, maxlength: 120, default: "" },
  referenceContrat: { type: String, trim: true, maxlength: 120, default: "" },
  notes:            { type: String, trim: true, maxlength: 1000, default: "" },
  statut:           { type: String, enum: ["propose", "accepte"], default: "propose" },
  valideAcheteur:   { type: validationSchema, default: () => ({}) },
  valideVendeur:    { type: validationSchema, default: () => ({}) },
  valideLe:         { type: Date, default: null },   // date de l'accord des deux parties
  historique:       [historiqueSchema],
}, { _id: false });
