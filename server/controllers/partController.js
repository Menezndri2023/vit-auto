import mongoose from "mongoose";
import logger from "../utils/logger.js";
import SparePart from "../models/SparePart.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Notification from "../models/Notification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import { validateImageDataUri } from "../utils/imageValidation.js";
import { logAction } from "../middleware/auditLog.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { uploadBase64Images, FOLDERS } from "../config/imagekit.js";
import { refusDePublication } from "../utils/publishingGate.js";
import { refusDePerimetre } from "../utils/perimetre.js";
import { refusDeQuota, enregistrerCompteur } from "../services/quotaAnnonces.js";
import { isValidCountryCode } from "../utils/countries.js";
import { calculerLivraisonPiece, fraisImportationPiece } from "../services/partShipping.js";
import {
  PART_CATEGORIES, PART_CATEGORY_LABELS, PART_CONDITIONS, PART_SALE_MODES, PART_SHIPPING_MODES, MAX_PART_QUANTITY,
} from "../constants/spareParts.js";

// Quota d'annonces du secteur « pièces » (voir services/quotaAnnonces.js) :
// le compteur vit ici, avec le modèle.
enregistrerCompteur("pieces", (ownerId, statutsActifs) =>
  SparePart.countDocuments({ owner: ownerId, status: { $in: statutsActifs } }));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAX_PART_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_PHOTOS = 8;

// Même validation que activityController.validateActivityImages.
function validatePartImages(images) {
  if (!Array.isArray(images)) return null;
  if (images.length > MAX_PHOTOS + 1) return `Maximum ${MAX_PHOTOS} photos.`;
  for (const img of images) {
    if (typeof img !== "string" || !img) continue;
    if (img.startsWith("data:")) {
      const check = validateImageDataUri(img, MAX_PART_IMAGE_BYTES);
      if (!check.ok) return check.message;
    } else if (!/^https?:\/\//i.test(img) || img.length > MAX_IMAGE_URL_LENGTH) {
      return "Image invalide : URL http(s) ou image encodée attendue.";
    }
  }
  return null;
}

const num = (v, { min = 0, max = Infinity, def = null } = {}) => {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return undefined; // invalide
  return n;
};

// Normalise et valide les champs métier communs à la création et à l'édition.
// Renvoie { error } ou { data }.
async function normaliserChamps(body, { partial = false } = {}) {
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (has("category") || !partial) {
    if (!PART_CATEGORIES.includes(body.category)) return { error: "Catégorie invalide." };
    data.category = body.category;
  }
  if (has("title") || !partial) {
    const t = String(body.title || "").trim();
    if (!t) return { error: "Titre requis." };
    data.title = t.slice(0, 160);
  }
  if (has("description")) data.description = String(body.description || "").trim().slice(0, 4000);
  if (has("brand"))       data.brand = String(body.brand || "").trim().slice(0, 80) || null;
  if (has("reference"))   data.reference = String(body.reference || "").trim().slice(0, 80) || null;
  if (has("condition")) {
    if (!PART_CONDITIONS.includes(body.condition)) return { error: "État de la pièce invalide." };
    data.condition = body.condition;
  }
  if (has("compatibility")) {
    if (!Array.isArray(body.compatibility)) return { error: "Compatibilité invalide." };
    data.compatibility = body.compatibility
      .filter((c) => c && String(c.marque || "").trim())
      .slice(0, 30)
      .map((c) => ({
        marque: String(c.marque).trim().slice(0, 60),
        modele: c.modele ? String(c.modele).trim().slice(0, 60) : null,
        anneeDebut: num(c.anneeDebut, { min: 1950, max: 2100 }) ?? null,
        anneeFin:   num(c.anneeFin,   { min: 1950, max: 2100 }) ?? null,
      }));
  }
  if (has("compatibilityText")) data.compatibilityText = String(body.compatibilityText || "").trim().slice(0, 500) || null;

  if (has("saleMode") || !partial) {
    const m = body.saleMode || "direct";
    if (!PART_SALE_MODES.includes(m)) return { error: "Mode de vente invalide." };
    data.saleMode = m;
  }
  if (has("importInfo")) {
    const ii = body.importInfo || {};
    const origin = ii.originCountry ? String(ii.originCountry).toUpperCase() : null;
    if (origin && !(await isValidCountryCode(origin))) return { error: "Pays d'origine invalide." };
    const leadTimeDays = num(ii.leadTimeDays, { min: 1, max: 120 });
    const feesUSD = num(ii.feesUSD, { min: 0, def: 0 });
    const depositPercent = num(ii.depositPercent, { min: 0, max: 100, def: 50 });
    if (leadTimeDays === undefined || feesUSD === undefined || depositPercent === undefined) return { error: "Informations d'importation invalides." };
    data.importInfo = { originCountry: origin, leadTimeDays, feesUSD, customsIncluded: ii.customsIncluded !== false, depositPercent };
  }

  if (has("price") || !partial) {
    const p = num(body.price, { min: 0 });
    if (!(p > 0)) return { error: "Prix requis." };
    data.price = p;
  }
  if (has("currency"))           data.currency = body.currency || null;
  if (has("priceEntered"))       data.priceEntered = num(body.priceEntered, { min: 0 }) ?? null;
  if (has("priceEntryCurrency")) data.priceEntryCurrency = body.priceEntryCurrency || null;

  if (has("stock")) {
    const s = num(body.stock, { min: 0, def: null });
    if (s === undefined) return { error: "Stock invalide." };
    data.stock = s == null ? null : Math.floor(s);
  }
  if (has("minOrderQty")) {
    const q = num(body.minOrderQty, { min: 1, max: MAX_PART_QUANTITY, def: 1 });
    if (q === undefined) return { error: "Quantité minimale invalide." };
    data.minOrderQty = Math.floor(q);
  }
  if (has("weightKg")) {
    const w = num(body.weightKg, { min: 0, def: null });
    if (w === undefined) return { error: "Poids invalide." };
    data.weightKg = w;
  }

  if (has("shipping")) {
    const sh = body.shipping || {};
    const mode = sh.mode || "forfait";
    if (!PART_SHIPPING_MODES.includes(mode)) return { error: "Mode de livraison invalide." };
    const forfaitUSD = num(sh.forfaitUSD, { min: 0, def: 0 });
    const freeAboveUSD = num(sh.freeAboveUSD, { min: 0, def: null });
    const dMin = num(sh.deliveryDaysMin, { min: 0, max: 120, def: 1 });
    const dMax = num(sh.deliveryDaysMax, { min: 0, max: 120, def: 5 });
    if ([forfaitUSD, freeAboveUSD, dMin, dMax].includes(undefined)) return { error: "Conditions de livraison invalides." };
    const countries = Array.isArray(sh.countries) ? sh.countries.map((c) => String(c).toUpperCase()).filter(Boolean).slice(0, 30) : [];
    for (const c of countries) if (!(await isValidCountryCode(c))) return { error: `Pays de livraison invalide : ${c}.` };
    data.shipping = { mode, forfaitUSD, freeAboveUSD, deliveryDaysMin: dMin, deliveryDaysMax: Math.max(dMin, dMax), countries };
  }

  for (const k of ["ville", "adresse"]) if (has(k)) data[k] = String(body[k] || "").trim().slice(0, 160);
  if (has("coordonnees")) {
    const lat = num(body.coordonnees?.lat, { min: -90, max: 90, def: null });
    const lng = num(body.coordonnees?.lng, { min: -180, max: 180, def: null });
    data.coordonnees = lat != null && lng != null ? { lat, lng } : { lat: null, lng: null };
  }
  if (has("available"))      data.available = !!body.available;
  if (has("manuallyPaused")) data.manuallyPaused = !!body.manuallyPaused;
  return { data };
}

async function dossierSuspendu(userId) {
  const v = await PartnerVerification.findOne({ userId, status: { $in: ["suspendu", "rejete"] } }).select("status").lean();
  if (!v) return null;
  return {
    code: "PARTNER_SUSPENDED",
    message: v.status === "suspendu"
      ? "Votre dossier partenaire est suspendu. Contactez le support VIT AUTO."
      : "Votre dossier partenaire a été rejeté. Contactez le support VIT AUTO.",
  };
}

// ── Créer une annonce pièce (partenaire) ──────────────────────────────────
export const createPart = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }
    const refus = refusDePublication(req.user, "publier une pièce");
    if (refus) return res.status(403).json(refus);
    const refusSecteur = refusDePerimetre(req.user, "pieces", "publier une pièce");
    if (refusSecteur) return res.status(403).json(refusSecteur);
    const refusQuota = await refusDeQuota(req.user, "pieces");
    if (refusQuota) return res.status(403).json(refusQuota);
    const suspendu = await dossierSuspendu(req.user._id);
    if (suspendu) return res.status(403).json(suspendu);

    const { images, thumbnail } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: "Au moins une photo est requise." });
    }
    const imagesError = validatePartImages([...images, thumbnail].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });

    const { error, data } = await normaliserChamps(req.body);
    if (error) return res.status(400).json({ message: error });
    if (data.saleMode === "import" && !data.importInfo?.originCountry) {
      return res.status(400).json({ message: "Pays d'origine requis pour une vente importation." });
    }

    let business = null;
    if (req.body.businessId) {
      business = await (mongoose.Types.ObjectId.isValid(req.body.businessId) ? PartnerBusiness.findOne({ _id: req.body.businessId, owner: req.user._id }).lean() : null);
      if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
    }

    const uploadedImages = await uploadBase64Images(images, FOLDERS.parts);
    const [uploadedThumb] = thumbnail ? await uploadBase64Images([thumbnail], FOLDERS.parts) : [null];

    const part = await SparePart.create({
      ...data,
      images: uploadedImages,
      thumbnail: uploadedThumb || uploadedImages[0] || null,
      // Champs serveur — jamais depuis req.body
      owner:    req.user._id,
      business: business?._id || null,
      country:  business?.country || req.user.country || null,
      // Localisation héritée de l'entité si l'annonce n'en donne pas.
      ville:    data.ville || business?.ville || null,
      coordonnees: data.coordonnees?.lat != null ? data.coordonnees : (business?.coordonnees?.lat != null ? business.coordonnees : undefined),
      status:   "pending",
    });

    try {
      const titre = "Annonce pièce soumise";
      const message = `Votre pièce « ${part.title} » est en cours de vérification.`;
      const notifDoc = await Notification.create({ user: req.user._id, type: "system", titre, message, lien: "/vendor/dashboard" });
      if (global._io) {
        global._io.to(`user_${req.user._id}`).emit("notification_new", {
          _id: notifDoc._id, type: "system", titre, message, lien: "/vendor/dashboard", lu: false, createdAt: notifDoc.createdAt,
        });
      }
    } catch (notifErr) {
      logger.error("Notification (non bloquant) :", notifErr.message);
    }
    notifyAdmins(
      "system",
      "🔩 Nouvelle annonce pièce détachée à valider",
      `« ${part.title} » publiée par ${req.user.firstName || ""} ${req.user.lastName || ""} attend une validation.`,
      "/admin?tab=catalogue&sub=parts"
    ).catch((e) => logger.error("notifyAdmins (non bloquant) :", e.message));

    res.status(201).json({ part });
  } catch (err) {
    logger.error("createPart:", err);
    if (err.name === "ValidationError") return res.status(400).json({ message: "Données invalides : " + err.message });
    res.status(500).json({ message: "Erreur création de l'annonce." });
  }
};

// ── Catalogue public ──────────────────────────────────────────────────────
export const getParts = async (req, res) => {
  try {
    const { category, marque, modele, condition, saleMode, country, ville, q } = req.query;
    const cacheKey = buildCacheKey("parts", { category, marque, modele, condition, saleMode, country, ville, q });
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = { status: "approved", available: true, manuallyPaused: { $ne: true } };
    if (category && PART_CATEGORIES.includes(category)) filter.category = category;
    if (condition && PART_CONDITIONS.includes(condition)) filter.condition = condition;
    if (saleMode && PART_SALE_MODES.includes(saleMode)) filter.saleMode = saleMode;
    if (ville) filter.ville = new RegExp(escapeRegex(String(ville).slice(0, 100)), "i");
    if (marque) filter["compatibility.marque"] = new RegExp(`^${escapeRegex(String(marque).slice(0, 60))}$`, "i");
    if (modele) filter["compatibility.modele"] = new RegExp(escapeRegex(String(modele).slice(0, 60)), "i");
    if (q) {
      const rx = new RegExp(escapeRegex(String(q).slice(0, 100)), "i");
      filter.$or = [{ title: rx }, { reference: rx }, { brand: rx }, { compatibilityText: rx }];
    }
    if (country && country !== "INTL") {
      const up = String(country).toUpperCase();
      // Une pièce livrable dans le pays du client (pays de l'annonce ou pays
      // desservi) — la pièce importée voyage, la pièce en stock aussi.
      filter.$and = [{ $or: [{ country: up }, { "shipping.countries": up }, { country: null }] }];
    }

    const parts = await SparePart.find(filter)
      .sort({ noteMoyenne: -1, createdAt: -1 })
      .limit(500)
      .populate("owner", "firstName")
      .lean();
    cacheSet(cacheKey, parts);
    res.json(parts);
  } catch (err) {
    logger.error("getParts:", err);
    res.status(500).json({ message: "Erreur récupération des pièces." });
  }
};

export const getPartById = async (req, res) => {
  try {
    const part = await SparePart.findById(req.params.id).populate("owner", "firstName");
    if (!part) return res.status(404).json({ message: "Pièce introuvable." });
    const isAdmin = req.user?.role === "admin";
    const isOwner = req.user && part.owner?._id?.toString() === req.user._id?.toString();
    if (part.status !== "approved" && !isAdmin && !isOwner) {
      return res.status(404).json({ message: "Pièce introuvable." });
    }
    if (!isOwner && !isAdmin) SparePart.updateOne({ _id: part._id }, { $inc: { vues: 1 } }).catch(() => {});
    res.json({ part });
  } catch (err) {
    logger.error("getPartById:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// Devis de livraison — même calcul que la commande (services/partShipping.js).
export const quoteShipping = async (req, res) => {
  try {
    const part = await SparePart.findById(req.params.id).lean();
    if (!part || part.status !== "approved") return res.status(404).json({ message: "Pièce introuvable." });
    const quantity = Math.max(1, Math.min(MAX_PART_QUANTITY, Math.floor(Number(req.query.quantity) || 1)));
    const lat = req.query.lat != null && req.query.lat !== "" ? Number(req.query.lat) : null;
    const lng = req.query.lng != null && req.query.lng !== "" ? Number(req.query.lng) : null;
    const livraison = await calculerLivraisonPiece(part, { quantity, clientLat: lat, clientLng: lng });
    const importFeesUSD = fraisImportationPiece(part);
    const sousTotal = Math.round(part.price * quantity * 100) / 100;
    res.json({
      quantity, sousTotalUSD: sousTotal, importFeesUSD,
      shipping: livraison,
      totalUSD: livraison.feeUSD == null ? null : Math.round((sousTotal + importFeesUSD + livraison.feeUSD) * 100) / 100,
      depositUSD: part.saleMode === "import" && part.importInfo?.depositPercent > 0
        ? Math.round((sousTotal + importFeesUSD) * (part.importInfo.depositPercent / 100) * 100) / 100
        : 0,
    });
  } catch (err) {
    logger.error("quoteShipping:", err);
    res.status(500).json({ message: "Erreur de calcul." });
  }
};

// ── Mes annonces (partenaire) ─────────────────────────────────────────────
export const getMyParts = async (req, res) => {
  try {
    const parts = await SparePart.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ parts });
  } catch (err) {
    logger.error("getMyParts:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Modifier (propriétaire ou admin) ──────────────────────────────────────
export const updatePart = async (req, res) => {
  try {
    const part = await SparePart.findById(req.params.id);
    if (!part) return res.status(404).json({ message: "Pièce introuvable." });
    const isOwner = part.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) return res.status(403).json({ message: "Accès refusé." });

    const { error, data } = await normaliserChamps(req.body, { partial: true });
    if (error) return res.status(400).json({ message: error });

    const nextImages = req.body.images !== undefined ? req.body.images : part.images;
    if (!Array.isArray(nextImages) || nextImages.length === 0) return res.status(400).json({ message: "Au moins une photo est requise." });
    const imagesError = validatePartImages([...nextImages, req.body.thumbnail].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });
    if (req.body.images !== undefined) data.images = await uploadBase64Images(nextImages, FOLDERS.parts);
    if (req.body.thumbnail !== undefined) {
      data.thumbnail = req.body.thumbnail ? (await uploadBase64Images([req.body.thumbnail], FOLDERS.parts))[0] : (data.images?.[0] || part.images[0] || null);
    }
    if (req.body.businessId !== undefined) {
      if (req.body.businessId === null || req.body.businessId === "") {
        data.business = null;
      } else {
        const business = await (mongoose.Types.ObjectId.isValid(req.body.businessId) ? PartnerBusiness.findOne({ _id: req.body.businessId, owner: part.owner }).lean() : null);
        if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
        data.business = business._id;
      }
    }
    const saleMode = data.saleMode || part.saleMode;
    const origin = data.importInfo?.originCountry ?? part.importInfo?.originCountry;
    if (saleMode === "import" && !origin) return res.status(400).json({ message: "Pays d'origine requis pour une vente importation." });

    Object.assign(part, data);
    await part.save();
    res.json({ part });
  } catch (err) {
    logger.error("updatePart:", err);
    if (err.name === "ValidationError") return res.status(400).json({ message: "Données invalides : " + err.message });
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

export const deletePart = async (req, res) => {
  try {
    const part = await SparePart.findById(req.params.id);
    if (!part) return res.status(404).json({ message: "Pièce introuvable." });
    const isOwner = part.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) return res.status(403).json({ message: "Accès refusé." });
    // Une annonce déjà vendue au moins une fois est archivée, jamais effacée :
    // les commandes passées y font référence (Booking.part).
    if (part.ventes > 0) {
      part.status = "archived"; part.available = false;
      await part.save();
      return res.json({ message: "Annonce archivée (des commandes y font référence).", archived: true });
    }
    await part.deleteOne();
    res.json({ message: "Annonce supprimée." });
  } catch (err) {
    logger.error("deletePart:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

// ── Admin ─────────────────────────────────────────────────────────────────
export const getPendingParts = async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    const filter = status && status !== "all" ? { status } : {};
    const parts = await SparePart.find(filter)
      .sort({ createdAt: status === "pending" ? 1 : -1 })
      .limit(500)
      .populate("owner", "firstName lastName email");
    res.json({ parts });
  } catch (err) {
    logger.error("getPendingParts:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

export const updatePartStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!["approved", "rejected", "pending", "archived"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    const part = await SparePart.findByIdAndUpdate(
      req.params.id, { status, rejectionReason: rejectionReason || null, updatedAt: new Date() }, { new: true }
    ).populate("owner", "_id firstName");
    if (!part) return res.status(404).json({ message: "Pièce introuvable." });

    const notifData = status === "approved"
      ? { type: "listing_approved", titre: "✅ Pièce approuvée", message: `Votre annonce « ${part.title} » est en ligne dans la rubrique Pièces détachées.`, lien: "/vendor/dashboard" }
      : status === "rejected"
        ? { type: "listing_rejected", titre: "❌ Pièce rejetée", message: `Votre annonce « ${part.title} » a été rejetée. ${rejectionReason || ""}`.trim(), lien: "/vendor/dashboard" }
        : null;
    if (notifData) {
      const notifDoc = await Notification.create({ user: part.owner._id, ...notifData });
      if (global._io) global._io.to(`user_${part.owner._id}`).emit("notification_new", { _id: notifDoc._id, ...notifData, lu: false, createdAt: notifDoc.createdAt });
    }
    logAction(req, `part_${status}`, "SparePart", part._id, { title: part.title, rejectionReason }).catch(() => {});
    res.json({ part });
  } catch (err) {
    logger.error("updatePartStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

export const bulkDeleteParts = async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) => mongoose.Types.ObjectId.isValid(id)).slice(0, 200);
    if (!ids.length) return res.status(400).json({ message: "Aucune annonce sélectionnée." });
    const filter = { _id: { $in: ids } };
    if (req.user.role !== "admin") filter.owner = req.user._id;
    const vendues = await SparePart.updateMany({ ...filter, ventes: { $gt: 0 } }, { $set: { status: "archived", available: false } });
    const r = await SparePart.deleteMany({ ...filter, ventes: { $not: { $gt: 0 } } });
    res.json({ deleted: r.deletedCount, archived: vendues.modifiedCount });
  } catch (err) {
    logger.error("bulkDeleteParts:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

// ── Import en masse (CSV / XLSX) — même convention que l'import de flotte ──
// (vehicleImportController : fichier en base64 + nom, parseUploadedFile pour
// CSV « ; » ou « , » et .xlsx). Traitement synchrone, borné à
// MAX_IMPORT_ROWS lignes : chaque ligne passe par la même normalisation que
// le formulaire (normaliserChamps) et le même quota ; les lignes refusées sont
// rapportées une à une, jamais avalées.
const MAX_IMPORT_ROWS = 500;
const COLONNES = {
  title: ["titre", "title", "designation", "désignation", "nom"],
  category: ["categorie", "catégorie", "category"],
  brand: ["fabricant", "marque_piece", "marque piece", "brand"],
  reference: ["reference", "référence", "ref", "oem"],
  condition: ["etat", "état", "condition"],
  price: ["prix", "price", "prix_unitaire"],
  currency: ["devise", "currency"],
  stock: ["stock", "quantite", "quantité", "qty"],
  minOrderQty: ["qte_min", "quantite_min", "min_order", "minimum"],
  saleMode: ["mode", "mode_vente", "sale_mode", "vente"],
  originCountry: ["pays_origine", "origine", "origin", "origin_country"],
  leadTimeDays: ["delai_jours", "délai", "delai", "lead_time"],
  importFees: ["frais_import", "frais_importation", "import_fees"],
  depositPercent: ["acompte", "acompte_pct", "deposit"],
  shippingMode: ["livraison", "shipping", "mode_livraison"],
  forfait: ["forfait_livraison", "forfait", "shipping_fee"],
  freeAbove: ["offerte_des", "livraison_offerte_des", "free_above"],
  deliveryDaysMin: ["delai_min", "delivery_min"],
  deliveryDaysMax: ["delai_max", "delivery_max"],
  compatibility: ["compatibilite", "compatibilité", "vehicules", "véhicules", "compatibility"],
  images: ["photos", "images", "photo", "image"],
  description: ["description", "details", "détails"],
  ville: ["ville", "city"],
  weightKg: ["poids", "poids_kg", "weight"],
};
const normHeader = (h) => String(h || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function lireLigne(row) {
  const parNom = {};
  for (const [k, v] of Object.entries(row)) parNom[normHeader(k)] = v;
  const val = (cle) => {
    for (const alias of COLONNES[cle]) { const v = parNom[normHeader(alias)]; if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim(); }
    return undefined;
  };
  return val;
}
const CATEGORIE_ALIAS = Object.fromEntries(Object.entries(PART_CATEGORY_LABELS).map(([k, l]) => [normHeader(l), k]));
function resoudreCategorie(v) {
  if (!v) return "AUTRE";
  const up = normHeader(v).toUpperCase().replace(/[^A-Z]+/g, "_");
  if (PART_CATEGORIES.includes(up)) return up;
  const parLibelle = CATEGORIE_ALIAS[normHeader(v)];
  if (parLibelle) return parLibelle;
  const debut = PART_CATEGORIES.find((c) => normHeader(c).startsWith(normHeader(v).slice(0, 4)));
  return debut || null;
}
// « Volkswagen Golf 2004-2012 ; Seat Leon » → compatibility[]
function parseCompatibilite(texte) {
  if (!texte) return [];
  return String(texte).split(/[;|\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 30).map((s) => {
    const m = s.match(/^(\S+)\s*(.*?)\s*(?:(\d{4})\s*[-–à]\s*(\d{4}))?$/);
    if (!m) return { marque: s };
    return { marque: m[1], modele: m[2] || null, anneeDebut: m[3] ? Number(m[3]) : null, anneeFin: m[4] ? Number(m[4]) : null };
  });
}

export const importParts = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) return res.status(403).json({ message: "Réservé aux partenaires." });
    const refus = refusDePublication(req.user, "importer des pièces");
    if (refus) return res.status(403).json(refus);
    const refusSecteur = refusDePerimetre(req.user, "pieces", "importer des pièces");
    if (refusSecteur) return res.status(403).json(refusSecteur);
    const suspendu = await dossierSuspendu(req.user._id);
    if (suspendu) return res.status(403).json(suspendu);

    const { fileBase64, fileName = "pieces.csv", dryRun = false } = req.body;
    if (!fileBase64 || typeof fileBase64 !== "string") return res.status(400).json({ message: "Fichier requis (CSV ou XLSX)." });
    const base64Data = fileBase64.includes(",") ? fileBase64.split(",").pop() : fileBase64;
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ message: "Fichier trop volumineux (5 Mo maximum)." });
    const { parseUploadedFile } = await import("../services/vehicleImportService.js");
    let rows;
    try { rows = await parseUploadedFile(buffer, fileName); }
    catch (e) { return res.status(400).json({ message: e.message }); }
    if (!rows.length) return res.status(400).json({ message: "Aucune ligne trouvée dans le fichier." });
    if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ message: `Maximum ${MAX_IMPORT_ROWS} lignes par import (${rows.length} trouvées).` });

    let business = null;
    if (req.body.businessId && mongoose.Types.ObjectId.isValid(req.body.businessId)) {
      business = await PartnerBusiness.findOne({ _id: req.body.businessId, owner: req.user._id }).lean();
    }

    const erreurs = [];
    const prets = [];
    for (const [i, row] of rows.entries()) {
      const ligne = i + 2; // en-tête = ligne 1
      const val = lireLigne(row);
      const category = resoudreCategorie(val("category"));
      if (!category) { erreurs.push({ ligne, message: `Catégorie inconnue « ${val("category")} »` }); continue; }
      const images = String(val("images") || "").split(/[|;\s]+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 8);
      if (!images.length) { erreurs.push({ ligne, message: "Au moins une URL de photo (http) est requise" }); continue; }
      const mode = /import/i.test(val("saleMode") || "") ? "import" : "direct";
      const shippingMode = /gratuit|free/i.test(val("shippingMode") || "") ? "gratuit" : /distance|km/i.test(val("shippingMode") || "") ? "distance" : "forfait";
      const condition = /occas/i.test(val("condition") || "") ? "occasion" : /recond/i.test(val("condition") || "") ? "reconditionne" : "neuf";
      const body = {
        category, title: val("title"), description: val("description"), brand: val("brand"), reference: val("reference"), condition,
        compatibility: parseCompatibilite(val("compatibility")), compatibilityText: null,
        saleMode: mode,
        importInfo: mode === "import" ? { originCountry: val("originCountry"), leadTimeDays: val("leadTimeDays") || 21, feesUSD: val("importFees") || 0, customsIncluded: true, depositPercent: val("depositPercent") ?? 50 } : undefined,
        price: val("price"), currency: val("currency") || null, priceEntered: val("price"), priceEntryCurrency: val("currency") || "USD",
        stock: val("stock"), minOrderQty: val("minOrderQty") || 1, weightKg: val("weightKg"),
        shipping: { mode: shippingMode, forfaitUSD: val("forfait") || 0, freeAboveUSD: val("freeAbove") || null, deliveryDaysMin: val("deliveryDaysMin") || 1, deliveryDaysMax: val("deliveryDaysMax") || 5, countries: [] },
        ville: val("ville") || business?.ville || "",
      };
      // Prix saisi dans la devise indiquée : converti en USD comme le formulaire.
      if (body.currency && body.currency !== "USD") {
        const { convertAmount } = await import("../services/currencyEngine.js");
        const usd = await convertAmount(Number(body.price), body.currency.toUpperCase(), "USD");
        if (usd == null) { erreurs.push({ ligne, message: `Devise inconnue « ${body.currency} »` }); continue; }
        body.price = usd; body.currency = body.currency.toUpperCase(); body.priceEntryCurrency = body.currency;
      }
      const { error, data } = await normaliserChamps(body);
      if (error) { erreurs.push({ ligne, message: error }); continue; }
      if (data.saleMode === "import" && !data.importInfo?.originCountry) { erreurs.push({ ligne, message: "Pays d'origine requis pour une importation" }); continue; }
      prets.push({ ...data, images, thumbnail: images[0], owner: req.user._id, business: business?._id || null, country: business?.country || req.user.country || null, status: "pending" });
    }

    // Quota du plan : le lot entier doit tenir (voir services/quotaAnnonces.js).
    if (prets.length && req.user.role !== "admin") {
      const refusQuota = await refusDeQuota(req.user, "pieces");
      if (refusQuota) return res.status(403).json({ ...refusQuota, erreurs });
    }
    if (dryRun) return res.json({ dryRun: true, lignes: rows.length, valides: prets.length, erreurs });

    const created = prets.length ? await SparePart.insertMany(prets, { ordered: false }) : [];
    if (created.length) {
      notifyAdmins("system", "🔩 Import de pièces détachées à valider",
        `${req.user.firstName || ""} ${req.user.lastName || ""} a importé ${created.length} pièce(s) — en attente de validation.`,
        "/admin?tab=pieces").catch((e) => logger.error("notifyAdmins (non bloquant) :", e.message));
    }
    res.status(201).json({ lignes: rows.length, crees: created.length, erreurs });
  } catch (err) {
    logger.error("importParts:", err);
    res.status(500).json({ message: "Erreur lors de l'import." });
  }
};
