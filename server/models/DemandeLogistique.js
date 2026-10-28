import mongoose from "mongoose";
import {
  STATUTS, TYPES_BESOIN, MODES_TRANSPORT, REPONSES_SOLLICITATION, STATUTS_DEVIS, MODELE_ECONOMIQUE,
  DONNEURS_ORDRE, PAYEURS, POSTES_COUT, NATURES_DEVIS, TYPES_DOCUMENT,
} from "../constants/logistique.js";

// Demande logistique (VIT-AUTO Logistique, 2026-10-27) — mise en relation
// GRATUITE entre un client et des prestataires (models/Prestataire.js). VIT
// AUTO n'est ni transporteur ni transitaire : elle qualifie la demande,
// sollicite les prestataires compatibles et trace le dossier. Le prix du
// transport se règle directement entre les parties.

const evenementSchema = new mongoose.Schema({
  statut:        { type: String, enum: STATUTS, default: null },  // statut atteint, si l'événement en change
  type:          { type: String, required: true },                // creation, statut, sollicitation, devis, reponse, note, document…
  note:          { type: String, trim: true, maxlength: 1000, default: "" },
  reference:     { type: String, trim: true, maxlength: 120, default: null },  // n° de suivi fourni par le prestataire
  par:           { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  role:          { type: String, enum: ["client", "prestataire", "admin", "systeme"], default: "systeme" },
  visibleClient: { type: Boolean, default: true },
  date:          { type: Date, default: Date.now },
}, { _id: true });

const sollicitationSchema = new mongoose.Schema({
  prestataire:  { type: mongoose.Schema.Types.ObjectId, ref: "Prestataire", required: true },
  solliciteLe:  { type: Date, default: Date.now },
  solliciteePar:{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reponse:      { type: String, enum: REPONSES_SOLLICITATION, default: "en_attente" },
  message:      { type: String, trim: true, maxlength: 1000, default: "" },
  repondueLe:   { type: Date, default: null },
}, { _id: true });

const posteSchema = new mongoose.Schema({
  categorie: { type: String, enum: POSTES_COUT, required: true },
  montant:   { type: Number, min: 0, default: null },
  inclus:    { type: Boolean, default: true },   // compris dans le montant du devis
  note:      { type: String, trim: true, maxlength: 300, default: "" },
}, { _id: false });

const documentSchema = new mongoose.Schema({
  type:     { type: String, enum: TYPES_DOCUMENT, required: true },
  nom:      { type: String, trim: true, maxlength: 160, default: "" },
  url:      { type: String, required: true },   // ImageKit privé, signé à la lecture
  note:     { type: String, trim: true, maxlength: 300, default: "" },
  role:     { type: String, enum: ["acheteur", "vendeur", "prestataire", "admin"], required: true },
  deposePar:{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  deposeLe: { type: Date, default: Date.now },
  // Aucun contrôle de conformité n'existe : un document n'est JAMAIS présenté
  // comme vérifié ou officiel.
  verifie:  { type: Boolean, default: false, validate: { validator: (v) => v === false, message: "VIT AUTO ne vérifie pas les documents déposés." } },
}, { _id: true });

const devisSchema = new mongoose.Schema({
  prestataire:          { type: mongoose.Schema.Types.ObjectId, ref: "Prestataire", required: true },
  version:              { type: Number, default: 1 },
  remplace:             { type: mongoose.Schema.Types.ObjectId, default: null },  // devis précédent du même prestataire
  montant:              { type: Number, required: true, min: 0 },
  devise:               { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
  inclus:               { type: String, trim: true, maxlength: 2000, default: "" },
  exclus:               { type: String, trim: true, maxlength: 2000, default: "" },
  delaiJoursMin:        { type: Number, min: 0, default: null },
  delaiJoursMax:        { type: Number, min: 0, default: null },
  valideJusquau:        { type: Date, required: true },
  fraisAdditionnels:    { type: String, trim: true, maxlength: 1000, default: "" },
  modalitesPaiement:    { type: String, trim: true, maxlength: 1000, default: "" },
  conditionsAnnulation: { type: String, trim: true, maxlength: 1000, default: "" },
  // Détail facultatif. Si des postes inclus sont chiffrés, leur somme égale
  // le montant (contrôle serveur) : un frais n'est jamais compté deux fois.
  postes:               [posteSchema],
  nature:               { type: String, enum: NATURES_DEVIS, default: "estimatif" },
  trajet:               { type: String, trim: true, maxlength: 300, default: "" },
  modeTransport:        { type: String, enum: [...MODES_TRANSPORT, null], default: null },
  statut:               { type: String, enum: STATUTS_DEVIS, default: "propose" },
  creeLe:               { type: Date, default: Date.now },
  modifieLe:            { type: Date, default: null },
}, { _id: true });

const demandeLogistiqueSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },   // VA-LOG-2026-000001
  // Demandeur : celui qui crée le dossier (acheteur, vendeur, ou client sans
  // commande). C'est lui qui accepte un devis pour le compte de la partie
  // contractante déclarée.
  client:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  roleDemandeur: { type: String, enum: ["acheteur", "vendeur", "independant"], default: "independant" },
  // Parties de la commande liée — LUES sur la commande par le serveur, jamais
  // reçues du navigateur. Vides pour une demande indépendante.
  parties: {
    acheteur: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    vendeur:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  },
  // Anti-doublon : un même envoi du formulaire rejoué ne crée pas un second
  // dossier (plusieurs dossiers par commande restent possibles).
  cleIdempotence: { type: String, trim: true, maxlength: 80, default: null },
  // Qui commande le transport et qui le paie : déclarés, jamais déduits de
  // l'Incoterm.
  donneurOrdre:   { type: String, enum: DONNEURS_ORDRE, default: "a_confirmer" },
  payeur:         { type: String, enum: PAYEURS, default: "a_confirmer" },
  precisionRoles: { type: String, trim: true, maxlength: 300, default: "" },
  // Copie INFORMATIVE des conditions Incoterms® de la commande à la création
  // du dossier ; la commande reste la référence.
  incotermCommande: {
    regle:     { type: String, default: null },
    lieuNomme: { type: String, default: null },
    version:   { type: String, default: null },
    statut:    { type: String, default: null },
  },
  // Confirmation par le vendeur/exportateur des informations d'enlèvement.
  enlevement: {
    disponible:            { type: Boolean, default: null },
    dateDisponibilite:     { type: Date, default: null },
    lieu:                  { type: String, trim: true, maxlength: 300, default: "" },
    poidsKg:               { type: Number, min: 0, default: null },
    volumeM3:              { type: Number, min: 0, default: null },
    chargement:            { type: String, trim: true, maxlength: 500, default: "" },
    contraintesManutention:{ type: String, trim: true, maxlength: 500, default: "" },
    documentsPrevus:       { type: String, trim: true, maxlength: 500, default: "" },
    confirmeLe:            { type: Date, default: null },
    par:                   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  documents: [documentSchema],

  // Coordonnées : visibles de l'admin, et du seul prestataire dont le devis a
  // été accepté. Jamais des prestataires simplement sollicités.
  contact: {
    nom:       { type: String, trim: true, maxlength: 120, default: "" },
    telephone: { type: String, trim: true, maxlength: 40, default: "" },
    email:     { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
  },

  typeBesoin: { type: String, enum: TYPES_BESOIN, required: true },
  depart:     { pays: { type: String, uppercase: true, trim: true, required: true }, ville: { type: String, trim: true, maxlength: 120, required: true } },
  arrivee:    { pays: { type: String, uppercase: true, trim: true, required: true }, ville: { type: String, trim: true, maxlength: 120, required: true } },
  modeSouhaite: { type: String, enum: MODES_TRANSPORT, default: "indifferent" },

  marchandise: {
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    quantite:    { type: Number, min: 1, default: 1 },
    poidsKg:     { type: Number, min: 0, default: null },
    longueurCm:  { type: Number, min: 0, default: null },
    largeurCm:   { type: Number, min: 0, default: null },
    hauteurCm:   { type: Number, min: 0, default: null },
    contraintes: { type: String, trim: true, maxlength: 1000, default: "" },
    // Véhicule à transporter (typeBesoin "vehicule")
    vehicule: {
      marque:  { type: String, trim: true, maxlength: 60, default: "" },
      modele:  { type: String, trim: true, maxlength: 60, default: "" },
      annee:   { type: Number, min: 1900, max: 2100, default: null },
      roulant: { type: Boolean, default: null },
    },
  },
  dateSouhaitee:        { type: Date, default: null },
  documentsDisponibles: { type: String, trim: true, maxlength: 1000, default: "" },

  // Rattachement facultatif à une commande d'un autre pôle (VIT-AUTO Trade ou
  // Parts) — la logistique n'y ajoute aucune commission.
  liens: {
    booking:     { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: "IETransaction", default: null },
  },

  statut: { type: String, enum: STATUTS, default: "recue", index: true },

  sollicitations: [sollicitationSchema],
  devis:          [devisSchema],

  // Copie EXACTE du devis au moment de l'acceptation : ses conditions ne
  // peuvent plus changer, même si le prestataire modifie son offre ensuite.
  devisAccepte: {
    devisId:     { type: mongoose.Schema.Types.ObjectId, default: null },
    prestataire: { type: mongoose.Schema.Types.ObjectId, ref: "Prestataire", default: null },
    copie:       { type: mongoose.Schema.Types.Mixed, default: null },
    version:     { type: Number, default: null },
    accepteLe:   { type: Date, default: null },
    acceptePar:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Déclarations figées au moment de l'acceptation. L'acceptation n'est PAS
    // une preuve de paiement.
    partieContractante: { type: String, default: null },
    payeur:             { type: String, default: null },
  },

  preuveLivraison: {
    url:      { type: String, default: null },   // ImageKit privé, signé à la lecture
    note:     { type: String, trim: true, maxlength: 500, default: "" },
    deposeLe: { type: Date, default: null },
  },

  motifAnnulation: { type: String, trim: true, maxlength: 500, default: "" },
  litige: {
    motif:      { type: String, trim: true, maxlength: 1000, default: "" },
    resolution: { type: String, trim: true, maxlength: 1000, default: "" },
    resoluLe:   { type: Date, default: null },
  },
  noteAdmin: { type: String, trim: true, maxlength: 1000, default: "" },  // jamais visible du client ni du prestataire

  // Jalons : posés la PREMIÈRE fois que le statut est atteint (voir
  // constants/logistique.js → JALONS). Base des indicateurs.
  jalons: {
    recueLe:             { type: Date, default: null },
    valideeLe:           { type: Date, default: null },
    premiereSollicitationLe: { type: Date, default: null },
    premiereReponseLe:   { type: Date, default: null },
    premierDevisLe:      { type: Date, default: null },
    devisAccepteLe:      { type: Date, default: null },
    commandeConfirmeeLe: { type: Date, default: null },
    transportDebuteLe:   { type: Date, default: null },
    livraisonDeclareeLe: { type: Date, default: null },
    clotureeLe:          { type: Date, default: null },
    annuleeLe:           { type: Date, default: null },
    litigeOuvertLe:      { type: Date, default: null },
  },

  // Modèle économique FIGÉ (décision de l'exploitant, 2026-10-27) : la seule
  // valeur admise est FREE_REFERRAL et la rémunération de VIT AUTO vaut 0.
  // Les validateurs empêchent toute écriture contraire — une monétisation
  // future demandera une décision, une validation juridique et un changement
  // de code explicite, pas un réglage.
  remuneration: {
    modele:     { type: String, enum: [MODELE_ECONOMIQUE], default: MODELE_ECONOMIQUE },
    montantUSD: { type: Number, default: 0, validate: { validator: (v) => v === 0, message: "Aucune rémunération logistique n'est autorisée." } },
  },

  evenements: [evenementSchema],
}, { timestamps: true });

demandeLogistiqueSchema.index({ "sollicitations.prestataire": 1, statut: 1 });
demandeLogistiqueSchema.index({ createdAt: -1 });
demandeLogistiqueSchema.index({ client: 1, cleIdempotence: 1 }, { unique: true, partialFilterExpression: { cleIdempotence: { $type: "string" } } });
demandeLogistiqueSchema.index({ "liens.booking": 1 });
demandeLogistiqueSchema.index({ "liens.transaction": 1 });
demandeLogistiqueSchema.index({ "depart.pays": 1, "arrivee.pays": 1 });

const DemandeLogistique = mongoose.models.DemandeLogistique || mongoose.model("DemandeLogistique", demandeLogistiqueSchema);
export default DemandeLogistique;
