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
import { resolveRequirements } from "../utils/partnerRequirements.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { uploadBase64Images, uploadBase64Document, FOLDERS } from "../config/imagekit.js";
import { getActiveRates } from "../services/currencyEngine.js";

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
// plutôt que de créer un nouveau circuit de vérification. La liste des documents
// requis vient de server/utils/partnerRequirements.js (point de vérité unique,
// partagé avec la redirection post-inscription et le wizard Founding Partner) —
// le CV reste validé séparément par validateCv ci-dessus, pas ici.
function missingDriverDocs(user) {
  const { docs } = resolveRequirements({ activity: "chauffeur", entityType: user.entityType }).driver;
  // Les 4 types acceptés par le KYC (User.identity.type enum — voir models/User.js
  // et KYC.jsx DOC_TYPES) sont tous vérifiés par le même circuit admin ; restreindre
  // ici à cni/passport bloquait silencieusement et définitivement tout chauffeur
  // ayant soumis un titre de séjour ou son permis comme pièce d'identité (bug réel).
  const hasIdentity = docs.includes("identity") && ["cni", "passport", "permis", "carte_sejour"].includes(user.identity?.type) && user.identity?.status === "verified";
  const license = user.driverLicenseOcr;
  const hasLicense = docs.includes("driverLicense") && !!(license?.licenseNumber && license?.frontImage) && !license?.isExpired;
  if (!hasIdentity && !hasLicense) return "Pièce d'identité vérifiée et permis de conduire vérifié requis pour publier un profil chauffeur.";
  if (!hasIdentity) return "Pièce d'identité vérifiée requise pour publier un profil chauffeur.";
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
      tarifEntered, tarifDemiJourneeEntered, tarifHeureEntered, priceEntryCurrency,
      disponibilite, zone, ville,
      experience, langues, permisCategorie, vehiculePersonnel, typeVehicule,
      images,
    } = req.body;

    const phone = telephone || contactTel || phoneRaw;

    // ── Devise d'affichage (facultative) — même validation que
    // vehicleController.createVehicle : null = pas de préférence, sinon doit
    // être une devise active réelle (ExchangeRate), jamais acceptée telle
    // quelle (un code inventé casserait silencieusement l'affichage public).
    if (req.body.currency) {
      const activeRates = await getActiveRates();
      if (!activeRates.some((r) => r.code === req.body.currency)) {
        return res.status(400).json({ message: "Devise d'affichage invalide." });
      }
    }

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

    // Bug réel corrigé (audit) : contrairement à vehicleController.createVehicle,
    // les photos chauffeur n'étaient jamais envoyées vers ImageKit — stockées en
    // base64 brut, gonflant chaque réponse /api/drivers (catalogue public,
    // aucune exclusion de champ contrairement à limitVehicleImages côté
    // véhicules) — même goulot d'étranglement déjà corrigé pour les véhicules
    // (voir imagekit.js uploadBase64Images). Jamais bloquant si ImageKit est
    // indisponible : reste en base64 en dégradation gracieuse.
    const [uploadedProfilePhoto] = await uploadBase64Images([profilePhoto], FOLDERS.drivers);
    const uploadedVehicleImages = vehicleImages.length ? await uploadBase64Images(vehicleImages, FOLDERS.drivers) : [];
    // Même correctif que profilePhoto/images ci-dessus — voir uploadBase64Document.
    const uploadedCv = await uploadBase64Document(cv, FOLDERS.drivers);

    const driver = await Driver.create({
      firstName, lastName, title, description,
      ...(phone ? { phone } : {}),
      profilePhoto: uploadedProfilePhoto, cv: uploadedCv,
      tarif: tarif || undefined, tarifDemiJournee: tarifDemiJournee || undefined, tarifHeure: tarifHeure || undefined,
      tarifEntered: tarifEntered != null && tarifEntered !== "" ? Number(tarifEntered) : null,
      tarifDemiJourneeEntered: tarifDemiJourneeEntered != null && tarifDemiJourneeEntered !== "" ? Number(tarifDemiJourneeEntered) : null,
      tarifHeureEntered: tarifHeureEntered != null && tarifHeureEntered !== "" ? Number(tarifHeureEntered) : null,
      priceEntryCurrency: priceEntryCurrency || null,
      currency: req.body.currency || null,
      disponibilite, zone, ville,
      experience,
      langues: langues || ["Français"],
      permisCategorie: Array.isArray(permisCategorie) && permisCategorie.length ? permisCategorie : ["B"],
      vehiculePersonnel: !!vehiculePersonnel,
      typeVehicule,
      images: uploadedVehicleImages,
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
      const titre   = "Profil chauffeur soumis";
      const message = "Votre profil chauffeur est en cours de vérification.";
      const notifDoc = await Notification.create({ user: req.user._id, type: "system", titre, message, lien: "/vendor/dashboard" });
      if (global._io) {
        global._io.to(`user_${req.user._id}`).emit("notification_new", {
          _id: notifDoc._id, type: "system", titre, message, lien: "/vendor/dashboard", lu: false, createdAt: notifDoc.createdAt,
        });
      }
    } catch (notifErr) {
      logger.error("Notification (non bloquant) :", notifErr.message);
    }

    // ── Notifier les admins (non bloquant) ───────────────────────────────
    // Bug réel corrigé (audit) : createDriver ne notifiait jamais les admins
    // d'un nouveau profil chauffeur en attente — ils ne le découvraient
    // qu'en rechargeant manuellement l'onglet Annonces & Validations.
    notifyAdmins(
      "new_driver",
      "🧑‍✈️ Nouveau profil chauffeur à valider",
      `${driver.firstName} ${driver.lastName} a soumis un profil chauffeur publié par ${req.user.firstName || ""} ${req.user.lastName || ""}.`,
      "/admin",
    ).catch((err) => logger.error("notifyAdmins createDriver (non bloquant) :", err.message));

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

    // owner.identity/driverLicenseOcr sont récupérés UNIQUEMENT pour calculer les
    // deux booléens publics ci-dessous (identityVerified/licenseVerified) — jamais
    // renvoyés tels quels : `owner` est reconstruit sans eux avant res.json (voir
    // .map ci-dessous). Le CV (`cv`), lui, est déjà public par conception (voir
    // Driver.js — "consultable par l'employeur potentiel").
    const drivers = await Driver.find(filter)
      .sort({ noteMoyenne: -1, createdAt: -1 })
      .populate("owner", "firstName phone identity.type identity.status driverLicenseOcr.licenseNumber driverLicenseOcr.isExpired")
      .lean();

    const publicDrivers = drivers.map((d) => {
      const owner = d.owner || {};
      // Mêmes 4 types acceptés que missingDriverDocs() ci-dessus — sinon un
      // chauffeur avec un titre de séjour/permis vérifié affichait publiquement
      // un badge "identité non vérifiée" malgré une vérification admin réelle.
      const identityVerified = ["cni", "passport", "permis", "carte_sejour"].includes(owner.identity?.type) && owner.identity?.status === "verified";
      const license = owner.driverLicenseOcr;
      const licenseVerified = !!(license?.licenseNumber && !license?.isExpired);
      return {
        ...d,
        owner: { _id: owner._id, firstName: owner.firstName },
        identityVerified,
        licenseVerified,
      };
    });

    cacheSet(cacheKey, publicDrivers);
    res.json(publicDrivers);
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

// ── Chauffeurs (admin) — même pattern que vehicleController.getVehicles :
// `status` par défaut "pending" (comportement historique de cette route,
// conservé pour ne rien casser côté appelants existants), ou "approved"/
// "rejected"/"all" pour couvrir toute la gestion admin (l'UI n'affichait
// jusqu'ici QUE les chauffeurs en attente, impossible de gérer/filtrer les
// profils déjà publiés ou rejetés sans repasser par la base directement).
export const getPendingDrivers = async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    const filter = status && status !== "all" ? { status } : {};
    // File d'attente pending triée du plus ancien au plus récent (ordre de
    // traitement FIFO déjà en place) ; les autres vues (approved/rejected/all)
    // en plus récent d'abord, comme vehicleController.getVehicles.
    const drivers = await Driver.find(filter)
      .sort({ createdAt: status === "pending" ? 1 : -1 })
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

    const driverStatusNotif = {
      type: status === "approved" ? "listing_approved" : "listing_rejected",
      titre: status === "approved" ? "Profil chauffeur approuvé ✅" : "Profil chauffeur rejeté ❌",
      message: status === "approved"
        ? `Votre profil "${driver.title}" est maintenant visible.`
        : `Votre profil "${driver.title}" a été rejeté. ${rejectionReason || ""}`,
      lien: "/vendor/dashboard",
    };
    const driverNotifDoc = await Notification.create({ user: driver.owner._id, ...driverStatusNotif });
    // Même angle mort que vehicleController.js corrigé précédemment : aucune
    // émission temps réel à l'approbation/rejet admin d'un profil chauffeur.
    if (global._io) {
      global._io.to(`user_${driver.owner._id}`).emit("notification_new", {
        _id: driverNotifDoc._id, ...driverStatusNotif, lu: false, createdAt: driverNotifDoc.createdAt,
      });
    }

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
      "tarifEntered", "tarifDemiJourneeEntered", "tarifHeureEntered", "priceEntryCurrency", "currency",
      "disponibilite", "zone", "ville",
      "experience", "langues", "permisCategorie", "vehiculePersonnel", "typeVehicule",
      "images",
    ];

    if (req.body.currency) {
      const activeRates = await getActiveRates();
      if (!activeRates.some((r) => r.code === req.body.currency)) {
        return res.status(400).json({ message: "Devise d'affichage invalide." });
      }
    }

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

    // uploadBase64Images ignore déjà toute valeur qui n'est pas un data URI
    // (une URL ImageKit déjà hébergée passe donc inchangée) — voir createDriver
    // pour le même correctif à la création.
    if (safeUpdate.profilePhoto !== undefined) {
      [safeUpdate.profilePhoto] = await uploadBase64Images([safeUpdate.profilePhoto], FOLDERS.drivers);
    }
    if (safeUpdate.images?.length) {
      safeUpdate.images = await uploadBase64Images(safeUpdate.images, FOLDERS.drivers);
    }

    // ── CV : requis en permanence (déjà exigé à la création) ────────────────
    const nextCv = safeUpdate.cv !== undefined ? safeUpdate.cv : driver.cv;
    const cvError = validateCv(nextCv);
    if (cvError) return res.status(400).json({ message: cvError });
    // Même correctif que profilePhoto/images ci-dessus — voir uploadBase64Document.
    if (safeUpdate.cv !== undefined) {
      safeUpdate.cv = await uploadBase64Document(safeUpdate.cv, FOLDERS.drivers);
    }

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
