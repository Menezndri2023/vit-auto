import mongoose from "mongoose";
import { cacheClear } from "../utils/catalogCache.js";
import { PART_CATEGORIES, PART_CONDITIONS, PART_SALE_MODES, PART_SHIPPING_MODES } from "../constants/spareParts.js";

/**
 * Pièce détachée (secteur « pièces », 2026-09-14) — annonce d'un partenaire
 * vendant une pièce en stock (vente directe) ou importée à la commande (vente
 * importation), toujours livrée. Modèle indépendant, comme Activity.js et
 * Driver.js : Vehicle est saturé de champs voiture sans équivalent ici.
 * La commande elle-même est un Booking de type "piece" (voir Booking.piece).
 */
const sparePartSchema = new mongoose.Schema({
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: "PartnerBusiness", default: null },

  category:    { type: String, enum: PART_CATEGORIES, required: true },
  title:       { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 4000 },
  // Fabricant de la pièce (Bosch, Valeo, pièce d'origine…) et référence
  // constructeur/OEM — la référence est ce que cherche un garagiste.
  brand:       { type: String, trim: true, maxlength: 80, default: null },
  reference:   { type: String, trim: true, maxlength: 80, default: null },
  condition:   { type: String, enum: PART_CONDITIONS, default: "neuf" },

  // Véhicules compatibles — liste structurée + texte libre (« toutes Golf 5
  // TDI 2004-2008 »). La liste sert au filtre marque/modèle du catalogue.
  compatibility: {
    type: [{
      marque:     { type: String, trim: true, required: true },
      modele:     { type: String, trim: true, default: null },
      anneeDebut: { type: Number, default: null },
      anneeFin:   { type: Number, default: null },
    }],
    default: [],
  },
  compatibilityText: { type: String, trim: true, maxlength: 500, default: null },

  // ── Mode de vente ─────────────────────────────────────────
  saleMode: { type: String, enum: PART_SALE_MODES, default: "direct" },
  // Importation : origine, délai annoncé et frais d'importation (transport
  // international + douane) — facturés en sus du prix, annoncés sur l'annonce.
  importInfo: {
    originCountry:   { type: String, uppercase: true, trim: true, default: null },
    leadTimeDays:    { type: Number, min: 1, max: 120, default: null },
    feesUSD:         { type: Number, min: 0, default: 0 },
    customsIncluded: { type: Boolean, default: true },
    // Acompte exigé à la confirmation d'une importation (% du prix pièce +
    // frais) — 0 = aucun acompte.
    depositPercent:  { type: Number, min: 0, max: 100, default: 50 },
  },

  // ── Prix (USD au stockage, devise d'affichage figée — voir Activity.js) ──
  price:              { type: Number, required: true, min: 0 },
  currency:           { type: String, default: null },
  priceEntered:       { type: Number, default: null },
  priceEntryCurrency: { type: String, default: null },

  // Stock : null = sur commande / non suivi ; sinon décrémenté à la commande
  // et restitué à l'annulation (voir bookingController, branche "piece").
  stock:       { type: Number, min: 0, default: null },
  // ── Alerte de stock bas (outil de palier, 2026-09-26) ────────────────────
  // Une pièce vendue mais indisponible, c'est une commande annulée et un
  // client perdu : sur un catalogue de plusieurs centaines de références,
  // personne ne surveille les compteurs à la main.
  //
  // `null` = pas de seuil, donc pas d'alerte. Le seuil ne peut être POSÉ
  // qu'avec le palier qui l'ouvre (`alerteStockBas`) ; une fois posé, il vit
  // sa vie — on ne retire pas au partenaire une alerte déjà configurée.
  seuilStockBas: { type: Number, min: 0, default: null },
  // Horodatage de la dernière alerte, remis à null dès que le stock repasse
  // au-dessus du seuil. Sans lui, chaque vente sous le seuil renotifierait.
  alerteStockLe: { type: Date, default: null },
  minOrderQty: { type: Number, min: 1, default: 1 },
  weightKg:    { type: Number, min: 0, default: null },

  // ── Livraison (toujours livrée — jamais de retrait) ───────
  shipping: {
    mode:            { type: String, enum: PART_SHIPPING_MODES, default: "forfait" },
    forfaitUSD:      { type: Number, min: 0, default: 0 },
    freeAboveUSD:    { type: Number, min: 0, default: null },
    deliveryDaysMin: { type: Number, min: 0, default: 1 },
    deliveryDaysMax: { type: Number, min: 0, default: 5 },
    // Pays desservis (ISO-2) ; vide = uniquement le pays de l'annonce.
    countries:       { type: [String], default: [] },
    // ── Zones tarifaires (outil de palier, 2026-09-26) ────────────────────
    // Jusqu'ici, UN forfait pour tous les pays desservis : livrer dans sa
    // propre ville coûtait au client le même prix qu'à l'autre bout du
    // corridor. Le partenaire perdait les commandes proches (trop cher) et
    // perdait de l'argent sur les lointaines (trop bon marché).
    //
    // Chaque zone porte son forfait, son seuil de gratuité et ses délais.
    // Le pays de destination choisit la zone ; s'il n'appartient à aucune,
    // on retombe sur le forfait unique ci-dessus — le palier gratuit garde
    // donc exactement le comportement d'avant.
    zones: {
      type: [{
        _id:             false,
        countries:       { type: [String], default: [] },
        forfaitUSD:      { type: Number, min: 0, default: 0 },
        freeAboveUSD:    { type: Number, min: 0, default: null },
        deliveryDaysMin: { type: Number, min: 0, default: null },
        deliveryDaysMax: { type: Number, min: 0, default: null },
      }],
      default: [],
    },
  },

  images:    { type: [String], default: [] },
  thumbnail: { type: String, default: null },

  country: { type: String, uppercase: true, trim: true, default: null },
  ville:   { type: String, trim: true },
  adresse: { type: String, trim: true },
  coordonnees: { lat: { type: Number }, lng: { type: Number } },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
  },

  available:      { type: Boolean, default: true },
  manuallyPaused: { type: Boolean, default: false },
  featured:       { type: Boolean, default: false },

  vues:        { type: Number, default: 0 },
  ventes:      { type: Number, default: 0 },
  noteMoyenne: { type: Number, default: 0, min: 0, max: 5 },
  nombreAvis:  { type: Number, default: 0 },

  status: { type: String, enum: ["pending", "approved", "rejected", "archived"], default: "pending" },
  rejectionReason: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

sparePartSchema.index({ owner: 1 });
sparePartSchema.index({ status: 1, available: 1, country: 1, createdAt: -1 });
sparePartSchema.index({ category: 1 });
sparePartSchema.index({ reference: 1 });
sparePartSchema.index({ "compatibility.marque": 1, "compatibility.modele": 1 });
sparePartSchema.index({ location: "2dsphere" });

sparePartSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  const lat = this.coordonnees?.lat;
  const lng = this.coordonnees?.lng;
  if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    this.location = { type: "Point", coordinates: [lng, lat] };
  } else {
    // Même correctif que Activity.js/Vehicle.js : sans reset, un `type:"Point"`
    // sans coordonnées est un GeoJSON invalide pour l'index 2dsphere.
    this.location = undefined;
  }
  next();
});

// Même règle que Vehicle/Activity/Driver (2026-09-15) : le cache catalogue
// (utils/catalogCache.js, clé « parts », 30 s) est vidé à toute écriture —
// une pièce publiée, mise en pause, épuisée (stock décrémenté par la commande)
// ou supprimée ne doit pas rester listée trente secondes de plus.
sparePartSchema.post(["save", "findOneAndUpdate", "updateOne", "updateMany", "deleteOne", "deleteMany", "findOneAndDelete", "insertMany"], function () { cacheClear(); });

const SparePart = mongoose.models.SparePart || mongoose.model("SparePart", sparePartSchema);
export default SparePart;
