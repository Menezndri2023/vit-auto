import mongoose from "mongoose";
import { INCOTERM_CODES } from "../constants/incoterms.js";

// Annonce import/export publiée par un partenaire importateur vérifié
const importExportListingSchema = new mongoose.Schema({
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  importerProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ImporterPartnerProfile",
    required: true,
  },
  // Entreprise du partenaire concernée par cette annonce (facultatif,
  // multi-entité/multi-pays — même principe que Vehicle.business). Absent
  // jusqu'ici : un exportateur avec plusieurs PartnerBusiness ne pouvait
  // attribuer aucune annonce export à une entité précise. Manque réel trouvé
  // en audit.
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerBusiness",
    default: null,
  },
  // Renseigné uniquement quand cette annonce provient de la conversion d'une
  // annonce véhicule (location/vente) — voir vehicleController.convertVehicleToExport.
  convertedFromVehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    default: null,
  },

  // ── Véhicule ───────────────────────────────────────────────────
  title:       { type: String, required: true, trim: true },
  make:        { type: String, required: true, trim: true },
  model:       { type: String, required: true, trim: true },
  year:        { type: Number, required: true },
  mileage:     { type: Number, default: 0 },
  fuelType:    { type: String, enum: ["essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl", "gaz", "autre"], default: "essence" },
  transmission:{ type: String, enum: ["manuelle", "automatique", "cvt", "semi_automatique"], default: "automatique" },
  bodyType:    { type: String, trim: true },    // berline, SUV, pickup...
  color:       { type: String, trim: true },
  condition:   { type: String, enum: ["neuf", "occasion", "reconditionne"], default: "occasion" },
  description: { type: String, trim: true },

  // ── Logistique ─────────────────────────────────────────────────
  sourceCountry: { type: String, required: true, trim: true },
  sourceCity:    { type: String, trim: true },
  availableIn:   { type: [String], default: [] },  // pays de livraison disponibles

  // ── Prix & conditions ──────────────────────────────────────────
  // `price` est le prix DEMANDÉ par l'exportateur. Il ne disait pas à quelle
  // condition de livraison il correspondait : un même montant signifie
  // « départ usine », « chargé à bord » ou « rendu dédouané » selon l'Incoterm,
  // avec des milliers de dollars d'écart. L'acheteur comparait donc des prix
  // incomparables.
  price:         { type: Number, required: true },
  // Le DOLLAR est la devise de référence des annonces d'export : c'est en
  // dollars que les exportateurs cotent, et c'est la devise pivot de la
  // plateforme (voir currencyEngine). Le défaut était l'euro, ce qui étiquetait
  // « EUR » un prix saisi en dollars par un exportateur chinois — sans qu'il
  // s'en aperçoive, et avec ~8 % d'écart pour l'acheteur.
  // L'affichage, lui, convertit toujours vers la devise du visiteur (PriceTag).
  currency:      { type: String, default: "USD" },


  priceIncludes: { type: [String], default: [] },  // dédouanement, transport...
  negotiable:    { type: Boolean, default: false },
  stockQty:      { type: Number, default: 1 },

  // ── Identifiants véhicule ──────────────────────────────────────
  vin:          { type: String, trim: true, default: null },  // Vehicle Identification Number
  vehicleHistory:{ type: String, trim: true, default: null }, // Historique (accidents, entretien, propriétaires)

  // ── Logistique & coûts estimatifs ─────────────────────────────
  estimatedShippingCost: { type: Number, default: null },      // en EUR
  shippingCostCurrency:  { type: String, default: "EUR" },
  estimatedDelay:        { type: String, trim: true, default: null }, // ex: "30-45 jours"
  shippingType:          {
    type: String,
    enum: ["maritime", "terrestre", "aerien", "multiple", null],
    default: null,
  },
  exportDocumentsAvailable: { type: [String], default: [] }, // ["facture", "connaissement", "certificat_origine"...]

  // Incoterm 2020 (règle vendeur/acheteur) épinglé sur l'annonce — voir
  // server/constants/incoterms.js pour la matrice de responsabilités.
  // FAS/FOB/CFR/CIF réservés à shippingType "maritime" (validé dans le controller).
  incoterm: {
    type: String,
    enum: [...INCOTERM_CODES, null],
    default: null,
  },

  // Méthodes d'export que l'exportateur sait PROPOSER pour cette annonce —
  // FOB, CFR, CIF, EXW… `incoterm` ci-dessus reste celle par défaut, retenue
  // pour l'affichage du prix ; celle-ci ouvre la négociation.
  //
  // Un exportateur travaille rarement sous un seul Incoterm : il livre au port
  // (FOB) pour un acheteur qui a son transitaire, et rendu à destination (CIF)
  // pour un acheteur qui n'en a pas. N'en stocker qu'un seul obligeait
  // l'acheteur à demander par message si l'autre était possible — une question
  // qui se pose à chaque annonce, et qui ne se posera plus.
  // Prix par Incoterm — le choix de l'exportateur.
  //
  // Un prix seul ne veut rien dire : « 21 500 $ » signifie chargé à bord (FOB),
  // fret payé (CFR) ou fret et assurance payés (CIF) selon la règle retenue,
  // avec des milliers de dollars d'écart entre les trois. Un exportateur
  // travaille d'ailleurs rarement sous une seule règle : FOB pour l'acheteur
  // qui a son transitaire, CIF pour celui qui n'en a pas — et son prix diffère
  // dans chaque cas.
  //
  // `incoterm` (ci-dessus) reste la règle par DÉFAUT, celle du prix affiché en
  // vitrine. Cette table porte les variantes que l'exportateur accepte, chacune
  // avec SON prix. Vide = une seule règle proposée, comportement antérieur.
  //
  // Une entrée sans prix (`price: null`) signifie « je peux organiser cette
  // règle, prix à convenir » : l'annonce affiche alors un tiret, jamais un
  // montant deviné.
  incotermPricing: [
    {
      _id:      false,
      incoterm: { type: String, enum: INCOTERM_CODES, required: true },
      price:    { type: Number, default: null },
    },
  ],

  // Moyens de paiement acceptés par l'exportateur pour CETTE annonce — cohérent
  // avec le vocabulaire déjà utilisé par IETransaction.escrow.method. Pas
  // d'espèces ("cash") pour un achat international : aucune remise en main
  // propre possible pour un véhicule expédié par container/fret.
  acceptedPaymentMethods: {
    type: [String],
    enum: ["carte", "virement", "mobile_money", "crypto", "lc"],
    default: [],
  },

  // ── Rapport d'inspection (ref) ─────────────────────────────────
  inspectionReport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InspectionReport",
    default: null,
  },

  // ── Médias ─────────────────────────────────────────────────────
  photos:   { type: [String], default: [] },       // base64 ou URLs
  mainPhoto:{ type: String,   default: null },
  videoUrl: { type: String,   trim: true, default: null }, // lien vidéo (YouTube, MP4...)

  // ── Statut publication ─────────────────────────────────────────
  status: {
    type: String,
    enum: ["draft", "pending", "approved", "rejected", "sold", "archived"],
    default: "pending",
  },
  adminNote:    { type: String, default: null },
  approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt:   { type: Date, default: null },

  // Métriques
  views:        { type: Number, default: 0 },
  inquiries:    { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

importExportListingSchema.index({ status: 1, createdAt: -1 });

// La liste admin (GET /api/import-export/listings/admin) n'applique AUCUN
// filtre de statut : l'index composé ci-dessus ne peut donc pas servir son tri
// sur createdAt seul — un index composé n'est utilisable pour un tri que si les
// champs qui précèdent sont contraints par une égalité. MongoDB retombait sur
// un tri en mémoire, plafonné à 32 Mo, alors que la collection pèse 372 Mo pour
// 219 annonces (photos base64, 1,7 Mo par annonce en moyenne). D'où un 500 sur
// l'onglet « Partenaires Export », à n'importe quelle pagination.
importExportListingSchema.index({ createdAt: -1 });
importExportListingSchema.index({ partner: 1 });
importExportListingSchema.index({ sourceCountry: 1 });
// Le filtrage pays teste sourceCountry OU availableIn (voir getListings) —
// availableIn est un tableau (multikey), indexé séparément pour couvrir ce cas.
importExportListingSchema.index({ availableIn: 1 });

importExportListingSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const ImportExportListing =
  mongoose.models.ImportExportListing ||
  mongoose.model("ImportExportListing", importExportListingSchema);

export default ImportExportListing;
