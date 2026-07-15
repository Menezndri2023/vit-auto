import logger from "../utils/logger.js";
import Driver from "../models/Driver.js";
import Notification from "../models/Notification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    // Whitelist des champs autorisés (évite mass assignment sur owner, stats, status)
    const {
      firstName, lastName, telephone, contactTel, phone: phoneRaw,
      profilePhoto, title, description,
      tarif, tarifHeure,
      disponibilite, zone, ville,
      experience, langues, permisCategorie, vehiculePersonnel, typeVehicule,
      images,
    } = req.body;

    const phone = telephone || contactTel || phoneRaw;

    const driver = await Driver.create({
      firstName, lastName, title, description,
      ...(phone ? { phone } : {}),
      profilePhoto: profilePhoto || null,
      tarif, tarifHeure,
      disponibilite, zone, ville,
      experience,
      langues: langues || ["Français"],
      permisCategorie: permisCategorie || "B",
      vehiculePersonnel: !!vehiculePersonnel,
      typeVehicule,
      images: images || [],
      // Champs serveur — jamais depuis req.body
      owner:         req.user._id,
      country:       req.user.country || null,
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
