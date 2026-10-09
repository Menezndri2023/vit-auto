import mongoose from "mongoose";
import {
  CODES_ETAPES, CODES_DOCUMENTS, RUBRIQUES_INSPECTION, ETATS_RUBRIQUE, VERDICTS_INSPECTION,
  GARANTIES_ASSURANCE, SITUATIONS_PRO,
} from "../constants/dossierImport.js";

// Dossier d'import (2026-10-07) — l'import est un service VIT AUTO suivi par un
// conseiller : chaque demande d'accompagnement ou achat d'une annonce export
// devient un dossier que le client et l'admin suivent étape par étape, du
// devis jusqu'à l'immatriculation. Référentiel : constants/dossierImport.js.
const evenementSchema = new mongoose.Schema({
  etape:         { type: String, enum: CODES_ETAPES, required: true },
  note:          { type: String, trim: true, maxlength: 1000, default: "" },
  visibleClient: { type: Boolean, default: true },
  par:           { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  date:          { type: Date, default: Date.now },
}, { _id: true });

const documentSchema = new mongoose.Schema({
  code:      { type: String, enum: CODES_DOCUMENTS, required: true },
  libelle:   { type: String, required: true },
  statut:    { type: String, enum: ["a_fournir", "fourni", "valide", "refuse", "non_requis"], default: "a_fournir" },
  url:       { type: String, default: null },   // ImageKit privé, signé à la lecture
  note:      { type: String, trim: true, maxlength: 500, default: "" },
  deposePar: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  deposeLe:  { type: Date, default: null },
}, { _id: false });

const dossierImportSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },   // VA-IMP-2026-000001
  client:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  source: {
    type:        { type: String, enum: ["accompagnement", "annonce"], required: true },
    demande:     { type: mongoose.Schema.Types.ObjectId, ref: "ImportExportRequest", default: null },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: "IETransaction", default: null, index: true },
    annonce:     { type: mongoose.Schema.Types.ObjectId, ref: "ImportExportListing", default: null },
  },

  origine:     { pays: { type: String, default: null }, port: { type: String, default: null } },
  destination: { pays: { type: String, default: null }, ville: { type: String, default: null }, port: { type: String, default: null } },

  vehicule: {
    titre:  { type: String, default: null },
    type:   { type: String, default: null },
    marque: { type: String, default: null },
    modele: { type: String, default: null },
    annee:  { type: Number, default: null },
    vin:    { type: String, default: null },
  },
  budget: { montant: { type: Number, default: null }, devise: { type: String, default: "USD" } },
  message: { type: String, trim: true, maxlength: 2000, default: "" },

  // Frais d'accompagnement : réglés au lancement du dossier (décision de
  // l'exploitant). Paiement en ligne fermé : le client déclare son règlement,
  // l'admin le confirme.
  pack: {
    code:       { type: String, enum: ["Silver", "Gold", "Platinum", "Executive", null], default: null },
    prix:       { type: Number, default: null },
    devise:     { type: String, default: "USD" },
    statut:     { type: String, enum: ["a_regler", "declare", "regle", "offert"], default: "a_regler" },
    referenceReglement: { type: String, default: null },
    declareLe:  { type: Date, default: null },
    regleLe:    { type: Date, default: null },
  },

  // Devis VIT AUTO : lignes libres (véhicule, transport, douane, frais…).
  devis: {
    lignes:   [{ libelle: { type: String, required: true }, montant: { type: Number, required: true }, cle: { type: String, default: null } }],
    total:    { type: Number, default: null },
    devise:   { type: String, default: "USD" },
    envoyeLe: { type: Date, default: null },
  },

  conseiller: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Prestataires de la zone Transit affectés au dossier (transitaire au port
  // d'arrivée, commissionnaire en douane, inspecteur…).
  prestataires: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, default: "transitaire" },
    affecteLe: { type: Date, default: Date.now },
  }],

  etape:      { type: String, enum: CODES_ETAPES, default: "demande_recue", index: true },
  statut:     { type: String, enum: ["en_cours", "termine", "annule"], default: "en_cours", index: true },
  motifAnnulation: { type: String, default: null },
  historique: [evenementSchema],
  documents:  [documentSchema],

  // Suivi maritime saisi par l'admin (ou le transitaire, zone Transit).
  expedition: {
    compagnie:      { type: String, default: null },
    navire:         { type: String, default: null },
    numeroConteneur: { type: String, default: null },
    numeroBL:       { type: String, default: null },
    mode:           { type: String, enum: ["roro", "conteneur", null], default: null },
    departLe:       { type: Date, default: null },
    arriveePrevueLe: { type: Date, default: null },
  },

  // ── Étape 3 (2026-10-09) ─────────────────────────────────────────────────
  // Inspection avant départ par un inspecteur de la zone Transit — jamais
  // l'exportateur qui vend. Un verdict « non conforme » bloque le paiement et
  // l'embarquement (constants/dossierImport.js).
  inspection: {
    statut:      { type: String, enum: ["non_demandee", "demandee", "realisee"], default: "non_demandee" },
    formule:     { type: String, enum: ["standard", "premium", "expertise", null], default: null },
    prix:        { type: Number, default: null },     // 0 si incluse dans le pack
    inspecteur:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    demandeeLe:  { type: Date, default: null },
    realiseeLe:  { type: Date, default: null },
    lieu:        { type: String, default: null },
    kilometrage: { type: Number, default: null },
    vinConforme: { type: Boolean, default: null },
    points: [{
      rubrique: { type: String, enum: RUBRIQUES_INSPECTION.map((r) => r.code), required: true },
      etat:     { type: String, enum: ETATS_RUBRIQUE, default: "non_verifie" },
      note:     { type: String, trim: true, maxlength: 500, default: "" },
      _id: false,
    }],
    synthese:    { type: String, trim: true, maxlength: 3000, default: "" },
    verdict:     { type: String, enum: [...VERDICTS_INSPECTION, null], default: null },
  },

  // Assurance du transport : le client la demande, VIT AUTO propose la prime
  // de l'assureur, le client l'accepte (ligne ajoutée au devis), VIT AUTO
  // confirme la souscription avec le numéro de police.
  assurance: {
    statut:        { type: String, enum: ["non_demandee", "demandee", "proposee", "acceptee", "souscrite", "refusee"], default: "non_demandee" },
    garantie:      { type: String, enum: [...Object.keys(GARANTIES_ASSURANCE), null], default: null },
    valeurAssuree: { type: Number, default: null },
    prime:         { type: Number, default: null },
    devise:        { type: String, default: "USD" },
    assureur:      { type: String, default: null },
    numeroPolice:  { type: String, default: null },
    note:          { type: String, trim: true, maxlength: 1000, default: "" },
    demandeeLe:    { type: Date, default: null },
    proposeeLe:    { type: Date, default: null },
    accepteeLe:    { type: Date, default: null },
    souscriteLe:   { type: Date, default: null },
  },

  // Financement : étudié par VIT AUTO avec un organisme partenaire (aucune
  // banque raccordée) ; la mensualité est calculée sur l'offre retenue.
  financement: {
    statut:          { type: String, enum: ["non_demande", "demande", "en_etude", "accorde", "refuse", "annule"], default: "non_demande" },
    montantDemande:  { type: Number, default: null },
    apport:          { type: Number, default: null },
    dureeMois:       { type: Number, default: null },
    revenusMensuels: { type: Number, default: null },
    situationPro:    { type: String, enum: [...SITUATIONS_PRO, null], default: null },
    devise:          { type: String, default: "USD" },
    organisme:       { type: String, default: null },
    montantAccorde:  { type: Number, default: null },
    tauxAnnuel:      { type: Number, default: null },
    mensualite:      { type: Number, default: null },
    fraisDossier:    { type: Number, default: null },
    note:            { type: String, trim: true, maxlength: 1000, default: "" },   // visible du client
    demandeLe:       { type: Date, default: null },
    decideLe:        { type: Date, default: null },
  },

  notesInternes: [{
    texte: { type: String, trim: true, maxlength: 2000, required: true },
    par:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    date:  { type: Date, default: Date.now },
  }],
}, { timestamps: true });

dossierImportSchema.index({ statut: 1, updatedAt: -1 });
dossierImportSchema.index({ "prestataires.user": 1, updatedAt: -1 });

const DossierImport = mongoose.models.DossierImport || mongoose.model("DossierImport", dossierImportSchema);
export default DossierImport;
