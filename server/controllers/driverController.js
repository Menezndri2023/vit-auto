import mongoose from "mongoose";
import logger from "../utils/logger.js";
import Driver from "../models/Driver.js";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Notification from "../models/Notification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import { validateImageDataUri, validateDocumentDataUri } from "../utils/imageValidation.js";
import { logAction } from "../middleware/auditLog.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MAX_DRIVER_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_URL_LENGTH   = 2048;
const MAX_CV_BYTES           = 8 * 1024 * 1024;

// CV obligatoire à la publication — consultable par un employeur potentiel
// avant une proposition d'embauche CDD/CDI (DriverEmployment). Accepte PDF ou
// image scannée (validateDocumentDataUri), ou une URL http(s) déjà hébergée.
function validateCv(cv) {
  if (!cv) return "CV requis pour publier un profil chauffeur.";
  if (typeof cv === "string" && cv.startsWith("data:")) {
    const check = validateDocumentDataUri(cv, MAX_CV_BYTES);
    if (!check.ok) return check.message;
  } else if (typeof cv !== "string" || !/^https?:\/\//i.test(cv) || cv.length > MAX_IMAGE_URL_LENGTH) {
    return "CV invalide : PDF/image encodée ou URL http(s) attendue.";
  }
  return null;
}

// Même validation que vehicleController.validateVehicleImages — un partenaire
// authentifié ne doit jamais pouvoir soumettre un blob arbitraire dans
// `images`/`profilePhoto` en dehors du flux prévu (compression client + upload).
function validateDriverImages(images) {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (typeof img !== "string" || !img) continue;
    if (img.startsWith("data:")) {
      const check = validateImageDataUri(img, MAX_DRIVER_IMAGE_BYTES);
      if (!check.ok) return check.message;
    } else if (!/^https?:\/\//i.test(img) || img.length > MAX_IMAGE_URL_LENGTH) {
      return "Image invalide : URL http(s) ou image encodée attendue.";
    }
  }
  return null;
}

// ── Pièce d'identité (CNI/passeport) + permis de conduire vérifiés — exigence
// obligatoire à la publication d'un profil chauffeur, quel que soit le type de
// vendeur (contrairement à Vehicle où un Founding Partner en est exempté) : un
// chauffeur transporte des clients, l'identité et le permis doivent être fiables.
// Réutilise les documents déjà vérifiés via /api/kyc (submit + submit-driver-license)
// plutôt que de créer un nouveau circuit de vérification.
function missingDriverDocs(user) {
  const hasIdentity = ["cni", "passport"].includes(user.identity?.type) && user.identity?.status === "verified";
  const license = user.driverLicenseOcr;
  const hasLicense = !!(license?.licenseNumber && license?.frontImage) && !license?.isExpired;
  if (!hasIdentity && !hasLicense) return "Pièce d'identité (CNI/passeport) et permis de conduire vérifiés requis pour publier un profil chauffeur.";
  if (!hasIdentity) return "Pièce d'identité (CNI/passeport) vérifiée requise pour publier un profil chauffeur.";
  if (!hasLicense) return "Permis de conduire vérifié (recto/verso, non expiré) requis pour publier un profil chauffeur.";
  return null;
}

// ── Créer un profil chauffeur (partenaire) ────────────────────────────────
export const createDriver = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    // Même logique que pour les véhicules (voir vehicleController.js createVehicle) :
    // un chauffeur particulier proposant son propre service n'a besoin que d'une
    // vérification d'identité KYC (déjà disponible via /kyc), pas de la
    // certification entreprise complète. Le type n'est jamais relu depuis
    // req.body une fois déjà fixé sur le compte (anti-contournement) — le corps
    // de la requête ne sert qu'à amorcer les comptes plus anciens.
    const SELLER_TYPES = ["particulier", "professionnel", "entreprise"];
    if (!req.user.sellerType && SELLER_TYPES.includes(req.body.typePubliant)) {
      req.user.sellerType = req.body.typePubliant;
      await req.user.save();
    }
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

    // Suspension/rejet Vérification Partenaire — voir vehicleController.js
    // createVehicle pour l'explication complète (deux systèmes de vérification
    // qui ne communiquaient jamais entre eux).
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

    // ── Pièce d'identité + permis obligatoires (voir missingDriverDocs) ──────
    if (req.user.role === "partenaire") {
      const docsError = missingDriverDocs(req.user);
      if (docsError) {
        return res.status(403).json({ code: "DRIVER_DOCS_REQUIRED", message: docsError });
      }
    }

    // Whitelist des champs autorisés (évite mass assignment sur owner, stats, status)
    const {
      firstName, lastName, telephone, contactTel, phone: phoneRaw,
      profilePhoto, cv, title, description,
      tarif, tarifDemiJournee, tarifHeure,
      disponibilite, zone, ville,
      experience, langues, permisCategorie, vehiculePersonnel, typeVehicule,
      images,
    } = req.body;

    const phone = telephone || contactTel || phoneRaw;

    // ── Photos : profil toujours requis ; véhicule requis seulement "avec véhicule" ──
    if (!profilePhoto) {
      return res.status(400).json({ message: "Photo de profil du chauffeur requise." });
    }
    const vehicleImages = vehiculePersonnel ? (images || []) : [];
    if (vehiculePersonnel && vehicleImages.length === 0) {
      return res.status(400).json({ message: "Au moins une photo du véhicule est requise pour un chauffeur avec véhicule." });
    }
    const imagesError = validateDriverImages([profilePhoto, ...vehicleImages]);
    if (imagesError) return res.status(400).json({ message: imagesError });

    // ── CV obligatoire ──────────────────────────────────────────────────────
    const cvError = validateCv(cv);
    if (cvError) return res.status(400).json({ message: cvError });

    // ── Entreprise du partenaire (facultatif) — même principe que Vehicle ───
    let business = null;
    if (req.body.businessId) {
      business = await PartnerBusiness.findOne({ _id: req.body.businessId, owner: req.user._id }).lean();
      if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
    }

    const driver = await Driver.create({
      firstName, lastName, title, description,
      ...(phone ? { phone } : {}),
      profilePhoto, cv,
      tarif: tarif || undefined, tarifDemiJournee: tarifDemiJournee || undefined, tarifHeure: tarifHeure || undefined,
      disponibilite, zone, ville,
      experience,
      langues: langues || ["Français"],
      permisCategorie: permisCategorie || "B",
      vehiculePersonnel: !!vehiculePersonnel,
      typeVehicule,
      images: vehicleImages,
      // Champs serveur — jamais depuis req.body
      owner:         req.user._id,
      business:      business?._id || null,
      country:       business?.country || req.user.country || null,
      status:        "pending",
      noteMoyenne:   0,
      nombreAvis:    0,
      missionsTotal: 0,
    });

    // Notification non bloquante
    try {
      await Notification.create({
        user: req.user._id,
        type: "system",
        titre: "Profil chauffeur soumis",
        message: "Votre profil chauffeur est en cours de vérification.",
        lien: "/vendor/dashboard",
      });
    } catch (notifErr) {
      logger.error("Notification (non bloquant) :", notifErr.message);
    }

    res.status(201).json({ driver });
  } catch (err) {
    logger.error("createDriver:", err);
    res.status(400).json({ message: err.message || "Erreur création chauffeur." });
  }
};

// ── Tous les chauffeurs approuvés (public) ────────────────────────────────
export const getDrivers = async (req, res) => {
  try {
    const { zone, disponibilite, country } = req.query;

    const cacheKey = buildCacheKey("drivers", { zone, disponibilite, country });
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = { status: "approved" };
    if (zone)         filter.zone = new RegExp(escapeRegex(String(zone).slice(0, 100)), "i");
    if (disponibilite) filter.disponibilite = disponibilite;
    // Voir vehicleController.getVehicles pour le même filtre (pays absent = pas de restriction).
    if (country && country !== "INTL") {
      filter.$or = [{ country: String(country).toUpperCase() }, { country: null }];
    }

    const drivers = await Driver.find(filter)
      .sort({ noteMoyenne: -1, createdAt: -1 })
      .populate("owner", "firstName phone");

    cacheSet(cacheKey, drivers);
    res.json(drivers);
  } catch (err) {
    logger.error("getDrivers:", err);
    res.status(500).json({ message: "Erreur récupération chauffeurs." });
  }
};

// ── Mes profils chauffeur (partenaire) ────────────────────────────────────
export const getMyDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ drivers });
  } catch (err) {
    logger.error("getMyDrivers:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Chauffeurs en attente (admin) ─────────────────────────────────────────
export const getPendingDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .populate("owner", "firstName lastName email");
    res.json({ drivers });
  } catch (err) {
    logger.error("getPendingDrivers:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Approuver / rejeter un chauffeur (admin) ──────────────────────────────
export const updateDriverStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { status, rejectionReason: rejectionReason || null },
      { new: true }
    ).populate("owner", "_id firstName");

    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    await Notification.create({
      user: driver.owner._id,
      type: status === "approved" ? "listing_approved" : "listing_rejected",
      titre: status === "approved" ? "Profil chauffeur approuvé ✅" : "Profil chauffeur rejeté ❌",
      message: status === "approved"
        ? `Votre profil "${driver.title}" est maintenant visible.`
        : `Votre profil "${driver.title}" a été rejeté. ${rejectionReason || ""}`,
      lien: "/vendor/dashboard",
    });

    res.json({ driver });
  } catch (err) {
    logger.error("updateDriverStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

// ── Supprimer un profil (propriétaire ou admin) ───────────────────────────
export const deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await driver.deleteOne();
    res.json({ message: "Profil supprimé." });
  } catch (err) {
    logger.error("deleteDriver:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

// ── Bloquer des dates (congés/indisponibilité) — jusqu'ici seul le calendrier
// en lecture seule (réservations existantes) était visible, aucun moyen pour
// le partenaire de bloquer proactivement des dates pour un chauffeur.
export const addDriverBlackout = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const { start, end, reason } = req.body;
    const startDate = start ? new Date(start) : null;
    const endDate   = end   ? new Date(end)   : null;
    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return res.status(400).json({ message: "Période invalide (date de fin après la date de début requises)." });
    }

    driver.blackoutDates.push({ start: startDate, end: endDate, reason: (reason || "").slice(0, 200) });
    await driver.save();

    res.status(201).json({ driver });
  } catch (err) {
    logger.error("addDriverBlackout:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const removeDriverBlackout = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    driver.blackoutDates = driver.blackoutDates.filter((b) => b._id.toString() !== req.params.blackoutId);
    await driver.save();

    res.json({ driver });
  } catch (err) {
    logger.error("removeDriverBlackout:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Supprimer plusieurs profils à la fois (sélection multiple) ──────────────
// Même principe que vehicleController.bulkDeleteVehicles : un partenaire ne
// peut supprimer que SES propres profils, même s'il envoie des IDs hors
// périmètre (filtrés silencieusement, jamais d'erreur trompeuse).
const MAX_BULK_DELETE = 100;
export const bulkDeleteDrivers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Liste d'identifiants requise." });
    }
    if (ids.length > MAX_BULK_DELETE) {
      return res.status(400).json({ message: `Maximum ${MAX_BULK_DELETE} profils à la fois.` });
    }
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const filter = { _id: { $in: validIds } };
    if (req.user.role !== "admin") filter.owner = req.user._id;

    const toDelete = await Driver.find(filter).select("_id firstName lastName owner").lean();
    if (toDelete.length === 0) {
      return res.status(404).json({ message: "Aucun profil trouvé ou accès refusé." });
    }

    const deletedIds = toDelete.map((d) => d._id.toString());
    await Driver.deleteMany({ _id: { $in: deletedIds } });

    if (req.user.role === "admin") {
      await logAction(req, "driver.admin_bulk_delete", "Driver", null, {
        before: { count: deletedIds.length, ids: deletedIds },
      });
    }

    res.json({ message: `${deletedIds.length} profil(s) supprimé(s).`, deletedCount: deletedIds.length, deletedIds });
  } catch (err) {
    logger.error("bulkDeleteDrivers:", err);
    res.status(500).json({ message: "Erreur suppression multiple." });
  }
};

// ── Modifier un profil chauffeur (propriétaire ou admin) ─────────────────────
// Il n'existait jusqu'ici aucune route d'édition pour un chauffeur (contrairement
// à Vehicle) — un partenaire ne pouvait que créer ou supprimer. Whitelist calquée
// sur vehicleController.updateVehicle : mêmes garde-fous (mass assignment, photos).
export const updateDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const EDITABLE = [
      "firstName", "lastName", "phone", "profilePhoto", "cv", "title", "description",
      "tarif", "tarifDemiJournee", "tarifHeure",
      "disponibilite", "zone", "ville",
      "experience", "langues", "permisCategorie", "vehiculePersonnel", "typeVehicule",
      "images",
    ];

    const safeUpdate = {};
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) safeUpdate[key] = req.body[key];
    }

    // Cohérence photos si l'un des deux champs est modifié (voir createDriver)
    const nextProfilePhoto = safeUpdate.profilePhoto !== undefined ? safeUpdate.profilePhoto : driver.profilePhoto;
    const nextVehiculePersonnel = safeUpdate.vehiculePersonnel !== undefined ? safeUpdate.vehiculePersonnel : driver.vehiculePersonnel;
    const nextImages = safeUpdate.images !== undefined ? safeUpdate.images : driver.images;
    if (!nextProfilePhoto) {
      return res.status(400).json({ message: "Photo de profil du chauffeur requise." });
    }
    if (nextVehiculePersonnel && (!nextImages || nextImages.length === 0)) {
      return res.status(400).json({ message: "Au moins une photo du véhicule est requise pour un chauffeur avec véhicule." });
    }
    if (!nextVehiculePersonnel) safeUpdate.images = [];
    const imagesError = validateDriverImages([nextProfilePhoto, ...(nextVehiculePersonnel ? nextImages : [])]);
    if (imagesError) return res.status(400).json({ message: imagesError });

    // ── CV : requis en permanence (déjà exigé à la création) ────────────────
    const nextCv = safeUpdate.cv !== undefined ? safeUpdate.cv : driver.cv;
    const cvError = validateCv(nextCv);
    if (cvError) return res.status(400).json({ message: cvError });

    // Rattachement à une entreprise du même propriétaire — même logique que
    // vehicleController.updateVehicle (déplacement du partenaire entre ses
    // propres entreprises/villes, sans changer de compte).
    if (req.body.businessId !== undefined) {
      if (req.body.businessId === null) {
        safeUpdate.business = null;
      } else {
        const business = await PartnerBusiness.findOne({ _id: req.body.businessId, owner: driver.owner }).lean();
        if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
        safeUpdate.business = business._id;
      }
    }

    const updated = await Driver.findByIdAndUpdate(req.params.id, safeUpdate, { new: true, runValidators: true });
    res.json({ driver: updated });
  } catch (err) {
    logger.error("updateDriver:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

// ── Transférer un profil chauffeur vers un autre compte/entreprise/ville/pays
// (admin uniquement) ─────────────────────────────────────────────────────────
// Un partenaire ne peut déplacer ses propres chauffeurs qu'entre SES entreprises
// (voir updateDriver ci-dessus, businessId) — changer le compte propriétaire
// (owner) reste un outil de support réservé à l'admin (annonce mal rattachée à
// la création, transfert de portefeuille entre partenaires...).
export const transferDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const { ownerId, businessId, country, ville } = req.body;
    const before = { owner: driver.owner, business: driver.business, country: driver.country, ville: driver.ville };
    const update = {};

    let resolvedOwnerId = driver.owner;
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
        // Une entreprise choisie fait autorité sur le pays, sauf si un pays est
        // explicitement fourni par ailleurs dans la même requête.
        if (country === undefined) update.country = business.country;
      }
    }
    if (country !== undefined) update.country = country ? String(country).toUpperCase() : null;
    if (ville   !== undefined) update.ville   = ville || undefined;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Aucun changement fourni (ownerId, businessId, country ou ville)." });
    }

    const updated = await Driver.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    await logAction(req, "driver.admin_transfer", "Driver", req.params.id, { before, after: update });

    res.json({ driver: updated });
  } catch (err) {
    logger.error("transferDriver:", err);
    res.status(500).json({ message: "Erreur lors du transfert." });
  }
};
