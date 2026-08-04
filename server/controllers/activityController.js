import mongoose from "mongoose";
import logger from "../utils/logger.js";
import Activity from "../models/Activity.js";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Notification from "../models/Notification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import { validateImageDataUri } from "../utils/imageValidation.js";
import { logAction } from "../middleware/auditLog.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { uploadBase64Images } from "../config/imagekit.js";
import { ACTIVITY_TYPES, ACTIVITY_PRICE_UNITS } from "../constants/activityTypes.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MAX_ACTIVITY_IMAGE_BYTES = 6 * 1024 * 1024; // cohérent avec Vehicle/Driver
const MAX_IMAGE_URL_LENGTH     = 2048;

// Même validation que vehicleController.validateVehicleImages/driverController
// .validateDriverImages — jamais de blob arbitraire en dehors du flux prévu
// (compression client + upload ImageKit).
function validateActivityImages(images) {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (typeof img !== "string" || !img) continue;
    if (img.startsWith("data:")) {
      const check = validateImageDataUri(img, MAX_ACTIVITY_IMAGE_BYTES);
      if (!check.ok) return check.message;
    } else if (!/^https?:\/\//i.test(img) || img.length > MAX_IMAGE_URL_LENGTH) {
      return "Image invalide : URL http(s) ou image encodée attendue.";
    }
  }
  return null;
}

const EDITABLE = [
  "activityType", "title", "description",
  "price", "priceUnit", "currency", "priceEntered", "priceEntryCurrency",
  "durationMinutes", "capacity",
  "essaiDisponible", "essaiDurationMinutes", "essaiPrice",
  "images", "thumbnail",
  "ville", "adresse", "coordonnees",
  "available", "manuallyPaused",
];

// ── Créer une annonce activité (partenaire) ───────────────────────────────
export const createActivity = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    // Même gating que vehicleController.createVehicle : KYC identité suffit
    // pour un particulier, certification partenaire complète sinon (sauf
    // Founding Partner déjà vérifié).
    const isIndividualSeller = req.user.sellerType === "particulier";
    if (req.user.role === "partenaire" && !req.user.isFounder) {
      if (isIndividualSeller) {
        if (req.user.kycStatus !== "VERIFIE") {
          return res.status(403).json({
            code:    "KYC_REQUIRED",
            message: "Complétez votre vérification d'identité (pièce d'identité + selfie) avant de publier.",
          });
        }
      } else if (req.user.certificationBadge === "none") {
        return res.status(403).json({
          code:    "CERTIFICATION_REQUIRED",
          message: "Complétez votre vérification partenaire avant de publier une annonce.",
        });
      }
    }

    const suspendedVerif = await PartnerVerification.findOne({
      userId: req.user._id,
      status: { $in: ["suspendu", "rejete"] },
    }).select("status").lean();
    if (suspendedVerif) {
      return res.status(403).json({
        code:    "PARTNER_SUSPENDED",
        message: suspendedVerif.status === "suspendu"
          ? "Votre dossier partenaire est suspendu. Contactez le support VIT AUTO."
          : "Votre dossier partenaire a été rejeté. Contactez le support VIT AUTO.",
      });
    }

    const {
      activityType, title, description,
      price, priceUnit, currency, priceEntered, priceEntryCurrency,
      durationMinutes, capacity,
      essaiDisponible, essaiDurationMinutes, essaiPrice,
      images, thumbnail, ville, adresse, coordonnees,
    } = req.body;

    if (!ACTIVITY_TYPES.includes(activityType)) {
      return res.status(400).json({ message: "Type d'activité invalide." });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Titre requis." });
    }
    if (!(Number(price) > 0)) {
      return res.status(400).json({ message: "Prix requis." });
    }
    if (priceUnit && !ACTIVITY_PRICE_UNITS.includes(priceUnit)) {
      return res.status(400).json({ message: "Unité de prix invalide." });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: "Au moins une photo est requise." });
    }
    const imagesError = validateActivityImages([...images, thumbnail].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });

    let business = null;
    if (req.body.businessId) {
      business = await PartnerBusiness.findOne({ _id: req.body.businessId, owner: req.user._id }).lean();
      if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
    }

    const uploadedImages = await uploadBase64Images(images);
    const [uploadedThumb] = thumbnail ? await uploadBase64Images([thumbnail]) : [null];

    const activity = await Activity.create({
      activityType, title, description,
      price: Number(price),
      priceUnit: priceUnit || "per_person",
      currency: currency || null,
      priceEntered: priceEntered != null ? Number(priceEntered) : null,
      priceEntryCurrency: priceEntryCurrency || null,
      durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : 60,
      capacity: Number(capacity) > 0 ? Number(capacity) : 1,
      essaiDisponible: !!essaiDisponible,
      essaiDurationMinutes: Number(essaiDurationMinutes) > 0 ? Number(essaiDurationMinutes) : 30,
      essaiPrice: essaiPrice != null && essaiPrice !== "" ? Number(essaiPrice) : null,
      images: uploadedImages,
      thumbnail: uploadedThumb,
      ville, adresse, coordonnees,
      // Champs serveur — jamais depuis req.body
      owner:    req.user._id,
      business: business?._id || null,
      country:  business?.country || req.user.country || null,
      status:   "pending",
    });

    try {
      const titre   = "Annonce activité soumise";
      const message = `Votre annonce "${activity.title}" est en cours de vérification.`;
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
      "new_activity",
      "🎈 Nouvelle annonce activité à valider",
      `"${activity.title}" publiée par ${req.user.firstName || ""} ${req.user.lastName || ""} attend une validation manuelle.`,
      "/admin",
    ).catch((err) => logger.error("notifyAdmins createActivity (non bloquant) :", err.message));

    res.status(201).json({ activity });
  } catch (err) {
    logger.error("createActivity:", err);
    res.status(400).json({ message: err.message || "Erreur création activité." });
  }
};

// ── Toutes les activités approuvées (public) ──────────────────────────────
export const getActivities = async (req, res) => {
  try {
    const { activityType, country, ville, essaiDisponible } = req.query;

    const cacheKey = buildCacheKey("activities", { activityType, country, ville, essaiDisponible });
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = { status: "approved", available: true, manuallyPaused: { $ne: true } };
    if (activityType && ACTIVITY_TYPES.includes(activityType)) filter.activityType = activityType;
    if (ville) filter.ville = new RegExp(escapeRegex(String(ville).slice(0, 100)), "i");
    if (essaiDisponible === "true") filter.essaiDisponible = true;
    if (country && country !== "INTL") {
      filter.$or = [{ country: String(country).toUpperCase() }, { country: null }];
    }

    const activities = await Activity.find(filter)
      .sort({ noteMoyenne: -1, createdAt: -1 })
      .populate("owner", "firstName phone")
      .lean();

    cacheSet(cacheKey, activities);
    res.json(activities);
  } catch (err) {
    logger.error("getActivities:", err);
    res.status(500).json({ message: "Erreur récupération activités." });
  }
};

export const getActivityById = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id).populate("owner", "firstName phone");
    if (!activity) return res.status(404).json({ message: "Activité introuvable." });
    res.json({ activity });
  } catch (err) {
    logger.error("getActivityById:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Mes annonces activité (partenaire) ────────────────────────────────────
export const getMyActivities = async (req, res) => {
  try {
    const activities = await Activity.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ activities });
  } catch (err) {
    logger.error("getMyActivities:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Activités (admin) — même pattern que driverController.getPendingDrivers ──
export const getPendingActivities = async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    const filter = status && status !== "all" ? { status } : {};
    const activities = await Activity.find(filter)
      .sort({ createdAt: status === "pending" ? 1 : -1 })
      .populate("owner", "firstName lastName email");
    res.json({ activities });
  } catch (err) {
    logger.error("getPendingActivities:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Approuver / rejeter une activité (admin) ──────────────────────────────
export const updateActivityStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const allowed = ["approved", "rejected", "pending", "archived"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const activity = await Activity.findByIdAndUpdate(
      req.params.id,
      { status, rejectionReason: rejectionReason || null },
      { new: true }
    ).populate("owner", "_id firstName");

    if (!activity) return res.status(404).json({ message: "Activité introuvable." });

    const notifData = {
      type: status === "approved" ? "listing_approved" : "listing_rejected",
      titre: status === "approved" ? "Annonce activité approuvée ✅" : "Annonce activité rejetée ❌",
      message: status === "approved"
        ? `Votre annonce "${activity.title}" est maintenant visible.`
        : `Votre annonce "${activity.title}" a été rejetée. ${rejectionReason || ""}`,
      lien: "/vendor/dashboard",
    };
    const notifDoc = await Notification.create({ user: activity.owner._id, ...notifData });
    if (global._io) {
      global._io.to(`user_${activity.owner._id}`).emit("notification_new", {
        _id: notifDoc._id, ...notifData, lu: false, createdAt: notifDoc.createdAt,
      });
    }

    res.json({ activity });
  } catch (err) {
    logger.error("updateActivityStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

// ── Modifier une annonce activité (propriétaire ou admin) ────────────────
export const updateActivity = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: "Activité introuvable." });

    const isOwner = activity.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const safeUpdate = {};
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) safeUpdate[key] = req.body[key];
    }

    if (safeUpdate.activityType && !ACTIVITY_TYPES.includes(safeUpdate.activityType)) {
      return res.status(400).json({ message: "Type d'activité invalide." });
    }
    if (safeUpdate.priceUnit && !ACTIVITY_PRICE_UNITS.includes(safeUpdate.priceUnit)) {
      return res.status(400).json({ message: "Unité de prix invalide." });
    }

    const nextImages = safeUpdate.images !== undefined ? safeUpdate.images : activity.images;
    if (!nextImages || nextImages.length === 0) {
      return res.status(400).json({ message: "Au moins une photo est requise." });
    }
    const imagesError = validateActivityImages([...nextImages, safeUpdate.thumbnail].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });

    if (safeUpdate.images?.length) {
      safeUpdate.images = await uploadBase64Images(safeUpdate.images);
    }
    if (safeUpdate.thumbnail) {
      [safeUpdate.thumbnail] = await uploadBase64Images([safeUpdate.thumbnail]);
    }

    if (req.body.businessId !== undefined) {
      if (req.body.businessId === null) {
        safeUpdate.business = null;
      } else {
        const business = await PartnerBusiness.findOne({ _id: req.body.businessId, owner: activity.owner }).lean();
        if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
        safeUpdate.business = business._id;
      }
    }

    const updated = await Activity.findByIdAndUpdate(req.params.id, safeUpdate, { new: true, runValidators: true });
    res.json({ activity: updated });
  } catch (err) {
    logger.error("updateActivity:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

// ── Supprimer une annonce (propriétaire ou admin) ─────────────────────────
export const deleteActivity = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: "Activité introuvable." });

    const isOwner = activity.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await activity.deleteOne();
    res.json({ message: "Annonce supprimée." });
  } catch (err) {
    logger.error("deleteActivity:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

// ── Bloquer des dates (congés/indisponibilité) — voir driverController
// .addDriverBlackout pour le même principe (maintenance matériel, congé). ──
export const addActivityBlackout = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: "Activité introuvable." });

    const isOwner = activity.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const { start, end, reason } = req.body;
    const startDate = start ? new Date(start) : null;
    const endDate   = end   ? new Date(end)   : null;
    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return res.status(400).json({ message: "Période invalide (date de fin après la date de début requises)." });
    }

    activity.blackoutDates.push({ start: startDate, end: endDate, reason: (reason || "").slice(0, 200) });
    await activity.save();

    res.status(201).json({ activity });
  } catch (err) {
    logger.error("addActivityBlackout:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const removeActivityBlackout = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: "Activité introuvable." });

    const isOwner = activity.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    activity.blackoutDates = activity.blackoutDates.filter((b) => b._id.toString() !== req.params.blackoutId);
    await activity.save();

    res.json({ activity });
  } catch (err) {
    logger.error("removeActivityBlackout:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Transférer une annonce activité vers un autre compte/entreprise/ville/pays
// (admin uniquement) — voir driverController.transferDriver pour le même principe. ──
export const transferActivity = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: "Activité introuvable." });

    const { ownerId, businessId, country, ville } = req.body;
    const before = { owner: activity.owner, business: activity.business, country: activity.country, ville: activity.ville };
    const update = {};

    let resolvedOwnerId = activity.owner;
    if (ownerId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(ownerId)) {
        return res.status(400).json({ message: "Compte propriétaire invalide." });
      }
      const newOwner = await User.findById(ownerId).select("role").lean();
      if (!newOwner || !["partenaire", "admin"].includes(newOwner.role)) {
        return res.status(400).json({ message: "Le compte destinataire doit être un partenaire." });
      }
      resolvedOwnerId = ownerId;
      update.owner = ownerId;
    }

    if (businessId !== undefined) {
      if (businessId === null) {
        update.business = null;
      } else {
        const business = await PartnerBusiness.findOne({ _id: businessId, owner: resolvedOwnerId }).lean();
        if (!business) return res.status(400).json({ message: "Entreprise introuvable pour ce propriétaire." });
        update.business = business._id;
        if (country === undefined) update.country = business.country;
      }
    }
    if (country !== undefined) update.country = country ? String(country).toUpperCase() : null;
    if (ville   !== undefined) update.ville   = ville || undefined;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Aucun changement fourni (ownerId, businessId, country ou ville)." });
    }

    const updated = await Activity.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    await logAction(req, "activity.admin_transfer", "Activity", req.params.id, { before, after: update });

    res.json({ activity: updated });
  } catch (err) {
    logger.error("transferActivity:", err);
    res.status(500).json({ message: "Erreur lors du transfert." });
  }
};

// ── Supprimer plusieurs annonces à la fois (sélection multiple) ──────────
const MAX_BULK_DELETE = 100;
export const bulkDeleteActivities = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Liste d'identifiants requise." });
    }
    if (ids.length > MAX_BULK_DELETE) {
      return res.status(400).json({ message: `Maximum ${MAX_BULK_DELETE} annonces à la fois.` });
    }
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const filter = { _id: { $in: validIds } };
    if (req.user.role !== "admin") filter.owner = req.user._id;

    const toDelete = await Activity.find(filter).select("_id title owner").lean();
    if (toDelete.length === 0) {
      return res.status(404).json({ message: "Aucune annonce trouvée ou accès refusé." });
    }

    const deletedIds = toDelete.map((a) => a._id.toString());
    await Activity.deleteMany({ _id: { $in: deletedIds } });

    if (req.user.role === "admin") {
      await logAction(req, "activity.admin_bulk_delete", "Activity", null, {
        before: { count: deletedIds.length, ids: deletedIds },
      });
    }

    res.json({ message: `${deletedIds.length} annonce(s) supprimée(s).`, deletedCount: deletedIds.length, deletedIds });
  } catch (err) {
    logger.error("bulkDeleteActivities:", err);
    res.status(500).json({ message: "Erreur suppression multiple." });
  }
};
