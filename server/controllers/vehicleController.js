import logger from "../utils/logger.js";
import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import Notification from "../models/Notification.js";
import Booking from "../models/Booking.js";
import { dispatch } from "../queue/index.js";
import { scoreAnnonce, buildVehicleWhitelist } from "../services/vehicleScoring.js";
import { logAction } from "../middleware/auditLog.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Créer une annonce véhicule (partenaire) ───────────────────────────────────
export const createVehicle = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    // ── Certification requise avant publication ───────────────────────────
    // Un partenaire doit avoir complété sa vérification (Founding Partner ou
    // certification "Partenaire Vérifié") avant de pouvoir publier une annonce —
    // sinon redirection côté frontend vers le programme Founding Partner
    // (voir VendorSubmit.jsx : code CERTIFICATION_REQUIRED).
    if (req.user.role === "partenaire" && !req.user.isFounder && req.user.certificationBadge === "none") {
      return res.status(403).json({
        code:    "CERTIFICATION_REQUIRED",
        message: "Complétez votre vérification partenaire avant de publier une annonce.",
      });
    }

    // ── Détection doublon (même marque + modèle + année + propriétaire) ────
    const dupMarque = req.body.marque;
    const dupModele = req.body.modele;
    const dupAnnee  = req.body.annee;
    if (dupMarque && dupModele && dupAnnee) {
      const existing = await Vehicle.findOne({
        owner:  req.user._id,
        marque: new RegExp(`^${escapeRegex(String(dupMarque))}$`, "i"),
        modele: new RegExp(`^${escapeRegex(String(dupModele))}$`, "i"),
        annee:  Number(dupAnnee),
        status: { $ne: "rejected" },
      });
      if (existing) {
        return res.status(409).json({
          message: `Vous avez déjà une annonce pour ce véhicule (${dupMarque} ${dupModele} ${dupAnnee}). Modifiez l'annonce existante.`,
          existingId: existing._id,
        });
      }
    }

    // ── Limite photos (max 8 côté backend) ────────────────────────────────
    if (req.body.images && req.body.images.length > 8) {
      req.body.images = req.body.images.slice(0, 8);
    }

    // ── Validation automatique ──────────────────────────────────────────────
    const validation = scoreAnnonce(req.body);

    // Extraire uniquement les champs légitimes du formulaire (pas de mass assignment sur stats/owner)
    const whitelisted = buildVehicleWhitelist(req.body);

    const vehicle = await Vehicle.create({
      ...whitelisted,
      // Champs serveur — jamais depuis req.body
      owner:              req.user._id,
      country:            req.user.country || null,
      status:             validation.status,
      available:          validation.status === "approved",
      validationScore:    validation.score,
      validationErrors:   validation.errors,
      validationWarnings: validation.warnings,
      autoValidated:      true,
      rejectionReason:    validation.status === "rejected"
        ? validation.errors.join(". ")
        : null,
      vues:        0,
      noteMoyenne: 0,
      nombreAvis:  0,
    });

    // ── Notification contextuelle (non bloquante) ────────────────────────────
    try {
      const notifMap = {
        approved: {
          type:    "listing_approved",
          titre:   "✅ Annonce approuvée et publiée !",
          message: `Votre annonce "${vehicle.title}" est maintenant visible dans le catalogue. Score : ${validation.score}/100.`,
        },
        rejected: {
          type:    "listing_rejected",
          titre:   "❌ Annonce non conforme",
          message: `Votre annonce "${vehicle.title}" a été rejetée. Problèmes : ${validation.errors.slice(0, 2).join(", ")}.`,
        },
        pending: {
          type:    "system",
          titre:   "⏳ Annonce en cours d'examen",
          message: `Votre annonce "${vehicle.title}" est en cours de vérification. Score actuel : ${validation.score}/100.`,
        },
      };
      await Notification.create({ user: req.user._id, lien: "/vendor/dashboard", ...notifMap[validation.status] });
    } catch (notifErr) {
      logger.error("Notification (non bloquant) :", notifErr.message);
    }

    // Calcul du score AI en arrière-plan
    dispatch.vehicleCreated(vehicle._id.toString()).catch(() => {});

    res.status(201).json({ vehicle, validation });
  } catch (err) {
    logger.error("createVehicle:", err);
    res.status(400).json({ message: "Erreur création véhicule." });
  }
};

// ── Tous les véhicules approuvés (public) avec pagination ────────────────────
export const getVehicles = async (req, res) => {
  try {
    const {
      type, ville, carburant, transmission, minPrice, maxPrice,
      vehicleType, search, owner, country,
      page  = 1,
      limit = 20,
      status,    // admin uniquement
    } = req.query;

    const isAdmin = req.user?.role === "admin";

    let filter;
    if (isAdmin && status && status !== "all") {
      filter = { status };                            // admin filtre par statut précis
    } else if (isAdmin) {
      filter = {};                                    // admin sans filtre = tous les statuts
    } else {
      filter = { status: "approved", available: true }; // public = approuvés seulement
    }

    if (type)         filter.type = type;
    if (vehicleType)  filter.vehicleType = vehicleType;
    if (ville)        filter.ville = new RegExp(escapeRegex(String(ville).slice(0, 100)), "i");
    if (carburant)    filter.carburant = carburant;
    if (transmission) filter.transmission = transmission;
    if (search) {
      const s = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { title:  new RegExp(s, "i") },
        { marque: new RegExp(s, "i") },
        { modele: new RegExp(s, "i") },
      ];
    }
    if (minPrice || maxPrice) {
      filter.pricePerDay = {};
      if (minPrice) filter.pricePerDay.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
    }
    // Filtre par propriétaire (showroom public partenaire) — validé ObjectId uniquement
    if (owner && /^[0-9a-f]{24}$/i.test(String(owner))) filter.owner = owner;

    // Filtre pays (International/"INTL" ou absent = aucune restriction). Les
    // annonces sans pays renseigné (créées avant cette fonctionnalité) restent
    // toujours visibles, quel que soit le pays demandé — jamais de régression
    // de visibilité pour les annonces existantes.
    if (country && country !== "INTL") {
      const countryOr = [{ country: String(country).toUpperCase() }, { country: null }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: countryOr }];
        delete filter.$or;
      } else {
        filter.$or = countryOr;
      }
    }

    const maxLimit  = isAdmin ? 500 : 100;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), maxLimit);
    const skip  = (Math.max(Number(page), 1) - 1) * safeLimit;
    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("owner", "firstName phone ville certificationBadge")
        .lean(),
      Vehicle.countDocuments(filter),
    ]);

    res.json({ vehicles, total, page: Number(page), pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getVehicles:", err);
    res.status(500).json({ message: "Erreur récupération véhicules." });
  }
};

// ── Détail d'un véhicule par ID (public) ─────────────────────────────────────
export const getVehicleById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Véhicule introuvable." });
    }
    const ownerFields = req.user?.role === "admin"
      ? "firstName lastName email phone profilePhoto role isActive kycStatus certificationBadge createdAt ville"
      : "firstName lastName phone ville certificationBadge";
    const vehicle = await Vehicle.findById(id).populate("owner", ownerFields).lean();
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });
    // Masquer les véhicules non approuvés aux non-admins
    if (vehicle.status !== "approved" && req.user?.role !== "admin" && vehicle.owner?._id?.toString() !== req.user?._id?.toString()) {
      return res.status(404).json({ message: "Véhicule introuvable." });
    }
    res.json({ vehicle });
  } catch (err) {
    logger.error("getVehicleById:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mes annonces (partenaire connecté) ────────────────────────────────────────
export const getMyVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ owner: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ vehicles });
  } catch (err) {
    logger.error("getMyVehicles:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Annonces en attente (admin) ───────────────────────────────────────────────
export const getPendingVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .populate("owner", "firstName lastName email phone")
      .lean();
    res.json({ vehicles });
  } catch (err) {
    logger.error("getPendingVehicles:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Approuver / rejeter une annonce (admin) ───────────────────────────────────
export const updateVehicleStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      {
        status,
        rejectionReason: rejectionReason || null,
        available: status === "approved",
      },
      { new: true }
    ).populate("owner", "_id firstName");

    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    await Notification.create({
      user:    vehicle.owner._id,
      type:    status === "approved" ? "listing_approved" : "listing_rejected",
      titre:   status === "approved" ? "Annonce approuvée ✅" : "Annonce rejetée ❌",
      message: status === "approved"
        ? `Votre annonce "${vehicle.title}" est maintenant en ligne.`
        : `Votre annonce "${vehicle.title}" a été rejetée. ${rejectionReason || ""}`,
      lien: "/vendor/dashboard",
    });

    res.json({ vehicle });
  } catch (err) {
    logger.error("updateVehicleStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

// ── Modifier une annonce (propriétaire ou admin) ──────────────────────────────
export const updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    // Whitelist des champs modifiables (évite le mass assignment sur owner, stats, etc.)
    const EDITABLE = [
      "title", "marque", "modele", "annee", "couleur", "kilometrage", "etat",
      "vehicleType", "carburant", "transmission", "nombrePlaces", "nombrePortes",
      "climatisation", "withDriver", "pricePerDay", "priceForSale", "caution",
      "leasing", "ageMin", "permisRequis", "assuranceOptionnelle",
      "contactNom", "contactTel", "ville", "adresse", "coordonnees",
      "images", "description", "available", "type",
    ];
    // Champs réservés admin
    const ADMIN_ONLY = ["featured", "sponsoredUntil", "boostLevel"];
    const safeUpdate = {};
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) safeUpdate[key] = req.body[key];
    }
    // Admin peut aussi modifier les champs réservés
    if (req.user.role === "admin") {
      for (const key of ADMIN_ONLY) {
        if (req.body[key] !== undefined) safeUpdate[key] = req.body[key];
      }
    }

    // Si un partenaire modifie, re-valider et recalculer le statut
    if (isOwner && req.user.role !== "admin") {
      const validation = scoreAnnonce({ ...vehicle.toObject(), ...safeUpdate });
      safeUpdate.status             = validation.status;
      safeUpdate.available          = validation.status === "approved";
      safeUpdate.validationScore    = validation.score;
      safeUpdate.validationErrors   = validation.errors;
      safeUpdate.validationWarnings = validation.warnings;
      safeUpdate.rejectionReason    = validation.status === "rejected"
        ? validation.errors.join(". ")
        : null;
    }

    const updated = await Vehicle.findByIdAndUpdate(req.params.id, safeUpdate, { new: true, runValidators: true });
    res.json({ vehicle: updated });
  } catch (err) {
    logger.error("updateVehicle:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

// ── Supprimer une annonce (propriétaire ou admin) ─────────────────────────────
export const deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await vehicle.deleteOne();
    // Journal d'audit global — uniquement quand un admin supprime l'annonce d'un
    // autre utilisateur (suppression par le propriétaire lui-même = action normale)
    if (req.user.role === "admin" && !isOwner) {
      await logAction(req, "vehicle.admin_delete", "Vehicle", req.params.id, {
        before: { title: vehicle.title, owner: vehicle.owner },
      });
    }
    res.json({ message: "Annonce supprimée." });
  } catch (err) {
    logger.error("deleteVehicle:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// DISPONIBILITÉ AUTOMATIQUE — Vérifie si un véhicule est occupé aujourd'hui
// Appelée par GET /api/vehicles/:id/availability
// ══════════════════════════════════════════════════════════════════════════════
export const getVehicleAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const vehicle = await Vehicle.findById(id).select("title type available owner");
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "transaction_concluded", "waiting_client_validation",
    ];

    // Vérifier s'il y a un conflit sur la plage demandée (ou aujourd'hui si pas de dates)
    const start = startDate ? new Date(startDate) : today;
    const end   = endDate   ? new Date(endDate)   : new Date(today.getTime() + 86400000);

    const conflict = await Booking.findOne({
      vehicle: id,
      status:  { $in: activeStatuses },
      "location.startDate": { $lt: end },
      "location.endDate":   { $gt: start },
    }).select("reference status location.startDate location.endDate -_id");

    const isOccupied = !!conflict;

    // Synchroniser le champ available si nécessaire
    if (vehicle.type === "location" && vehicle.available === isOccupied) {
      await Vehicle.findByIdAndUpdate(id, { available: !isOccupied });
    }

    res.json({
      vehicleId:   id,
      available:   !isOccupied,
      isOccupied,
      conflict:    conflict ? {
        reference:  conflict.reference,
        status:     conflict.status,
        startDate:  conflict.location?.startDate,
        endDate:    conflict.location?.endDate,
      } : null,
      checkedRange: { start, end },
    });
  } catch (err) {
    logger.error("getVehicleAvailability:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SYNCHRONISATION GLOBALE — Met à jour la disponibilité de tous les véhicules
// Appelée par POST /api/vehicles/sync-availability (admin)
// ══════════════════════════════════════════════════════════════════════════════
export const syncAllAvailability = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "transaction_concluded", "waiting_client_validation",
    ];

    // Trouver tous les véhicules location
    const vehicles = await Vehicle.find({ type: "location" }).select("_id available").lean();

    // Pour chaque véhicule, vérifier s'il a un booking actif aujourd'hui
    const activeBookings = await Booking.find({
      status:  { $in: activeStatuses },
      "location.startDate": { $lt: tomorrow },
      "location.endDate":   { $gt: today },
    }).select("vehicle -_id").lean();

    const occupiedIds = new Set(activeBookings.map((b) => b.vehicle?.toString()));

    // bulkWrite en un seul aller-retour Mongo au lieu d'un findByIdAndUpdate séquentiel
    // par véhicule — et on n'écrit que les documents dont la valeur change réellement.
    const ops = [];
    for (const v of vehicles) {
      const shouldBeAvailable = !occupiedIds.has(v._id.toString());
      if (v.available !== shouldBeAvailable) {
        ops.push({ updateOne: { filter: { _id: v._id }, update: { $set: { available: shouldBeAvailable } } } });
      }
    }
    if (ops.length) await Vehicle.bulkWrite(ops);

    res.json({
      message: `Synchronisation terminée : ${ops.length} véhicule(s) mis à jour.`,
      total:    vehicles.length,
      occupied: occupiedIds.size,
      updated:  ops.length,
    });
  } catch (err) {
    logger.error("syncAllAvailability:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
