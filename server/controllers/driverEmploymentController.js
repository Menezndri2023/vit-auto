import logger from "../utils/logger.js";
import mongoose from "mongoose";
import DriverEmployment from "../models/DriverEmployment.js";
import Driver from "../models/Driver.js";
import Notification from "../models/Notification.js";
import { generateEmploymentContractPDF } from "../utils/pdfGenerator.js";

// ── Notifier un utilisateur (même schéma que bookingController.notify) ──────
async function notify(userId, type, titre, message, lien = "/dashboard") {
  if (!userId) return;
  const notif = await Notification.create({ user: userId, type, titre, message, lien }).catch(() => null);
  if (notif && global._io) {
    global._io.to(`user_${userId}`).emit("notification_new", {
      _id: notif._id, type, titre, message, lien, lu: false, createdAt: notif.createdAt,
    });
  }
}

// ── Créer une demande d'embauche CDD/CDI (client authentifié) ───────────────
export const createEmploymentRequest = async (req, res) => {
  try {
    const {
      driverId, contractType, startDate, endDate,
      proposedSalary, currency, workSchedule, missionDescription,
      country, ville,
    } = req.body;

    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ message: "Chauffeur invalide." });
    }
    if (!["cdd", "cdi"].includes(contractType)) {
      return res.status(400).json({ message: "Type de contrat invalide (cdd ou cdi)." });
    }
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ message: "Date de début invalide." });
    }
    if (contractType === "cdd" && (!endDate || isNaN(new Date(endDate).getTime()))) {
      return res.status(400).json({ message: "Date de fin requise pour un CDD." });
    }
    if (!proposedSalary || Number(proposedSalary) <= 0) {
      return res.status(400).json({ message: "Salaire proposé requis (> 0)." });
    }

    const driver = await Driver.findById(driverId).select("owner firstName lastName status");
    if (!driver || driver.status !== "approved") {
      return res.status(404).json({ message: "Profil chauffeur introuvable ou non disponible." });
    }

    const request = await DriverEmployment.create({
      driver: driver._id,
      employer: req.user._id,
      employerInfo: {
        firstName: req.user.firstName,
        lastName:  req.user.lastName,
        email:     req.user.email,
        phone:     req.user.phone,
      },
      contractType,
      startDate,
      endDate: contractType === "cdd" ? endDate : null,
      proposedSalary,
      currency: currency || "USD",
      workSchedule,
      missionDescription,
      location: { country: country || null, ville: ville || null },
      status: "pending",
    });

    await notify(
      driver.owner,
      "system",
      "💼 Nouvelle proposition d'embauche",
      `${req.user.firstName} propose un contrat ${contractType.toUpperCase()} à ${driver.firstName} ${driver.lastName}.`,
      "/vendor/dashboard"
    );

    res.status(201).json({ request });
  } catch (err) {
    logger.error("createEmploymentRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mes demandes envoyées (client) ───────────────────────────────────────────
export const getMyEmploymentRequests = async (req, res) => {
  try {
    const requests = await DriverEmployment.find({ employer: req.user._id })
      .sort({ createdAt: -1 })
      .populate("driver", "firstName lastName profilePhoto title zone");
    res.json({ requests });
  } catch (err) {
    logger.error("getMyEmploymentRequests:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Demandes reçues pour mes chauffeurs (partenaire) ─────────────────────────
export const getReceivedEmploymentRequests = async (req, res) => {
  try {
    const myDriverIds = await Driver.find({ owner: req.user._id }).select("_id").lean();
    const requests = await DriverEmployment.find({ driver: { $in: myDriverIds.map((d) => d._id) } })
      .sort({ createdAt: -1 })
      .populate("driver", "firstName lastName profilePhoto title")
      .populate("employer", "firstName lastName email phone");
    res.json({ requests });
  } catch (err) {
    logger.error("getReceivedEmploymentRequests:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Accepter / refuser une demande (partenaire propriétaire du chauffeur) ───
export const respondToEmploymentRequest = async (req, res) => {
  try {
    const { action, reason } = req.body; // action: "accept" | "decline"
    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({ message: "Action invalide (accept ou decline)." });
    }

    const request = await DriverEmployment.findById(req.params.id).populate("driver", "owner firstName lastName");
    if (!request) return res.status(404).json({ message: "Demande introuvable." });

    const ownerId = request.driver?.owner?.toString();
    if (req.user.role !== "admin" && ownerId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    if (request.status !== "pending") {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }

    request.status = action === "accept" ? "accepted" : "declined";
    request.declineReason = action === "decline" ? (reason || null) : null;
    request.respondedAt = new Date();
    await request.save();

    await notify(
      request.employer,
      "system",
      action === "accept" ? "✅ Embauche acceptée" : "❌ Embauche refusée",
      action === "accept"
        ? `${request.driver.firstName} ${request.driver.lastName} a accepté votre proposition ${request.contractType.toUpperCase()}. Téléchargez le récapitulatif depuis votre tableau de bord.`
        : `${request.driver.firstName} ${request.driver.lastName} a décliné votre proposition. ${reason || ""}`,
      "/dashboard"
    );

    res.json({ request });
  } catch (err) {
    logger.error("respondToEmploymentRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Annuler une demande (client, tant qu'elle est en attente) ────────────────
export const cancelEmploymentRequest = async (req, res) => {
  try {
    const request = await DriverEmployment.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Demande introuvable." });
    if (request.employer.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé." });
    }
    if (request.status !== "pending") {
      return res.status(409).json({ message: "Seule une demande en attente peut être annulée." });
    }
    request.status = "cancelled";
    await request.save();
    res.json({ request });
  } catch (err) {
    logger.error("cancelEmploymentRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Liste complète (admin, supervision) ──────────────────────────────────────
export const adminListEmploymentRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * safeLimit;

    const [requests, total] = await Promise.all([
      DriverEmployment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("driver", "firstName lastName")
        .populate("employer", "firstName lastName email")
        .lean(),
      DriverEmployment.countDocuments(filter),
    ]);

    res.json({ requests, total, page: Number(page), pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("adminListEmploymentRequests:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Télécharger le récapitulatif PDF (employeur, propriétaire du chauffeur ou admin) ─
export const downloadEmploymentContractPdf = async (req, res) => {
  try {
    const request = await DriverEmployment.findById(req.params.id)
      .populate("driver", "owner firstName lastName phone")
      .populate("employer", "firstName lastName");
    if (!request) return res.status(404).json({ message: "Demande introuvable." });

    const uid = req.user._id.toString();
    const isEmployer = request.employer?._id?.toString() === uid;
    const isDriverOwner = request.driver?.owner?.toString() === uid;
    if (!isEmployer && !isDriverOwner && req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé." });
    }

    generateEmploymentContractPDF(request, res);
  } catch (err) {
    logger.error("downloadEmploymentContractPdf:", err);
    res.status(500).json({ message: "Erreur génération PDF." });
  }
};

// ── Traiter une demande acceptée (admin) : formaliser le contrat (clauses
// personnalisables) et l'envoyer automatiquement au partenaire ─────────────
// Distinct de respondToEmploymentRequest (décision accepter/refuser, côté
// partenaire) : ici l'admin finalise le document une fois l'accord de
// principe donné, avant transmission officielle.
export const processEmploymentRequest = async (req, res) => {
  try {
    const { contractConditions } = req.body;

    const request = await DriverEmployment.findById(req.params.id)
      .populate("driver", "owner firstName lastName")
      .populate("employer", "firstName lastName email");
    if (!request) return res.status(404).json({ message: "Demande introuvable." });
    if (request.status !== "accepted") {
      return res.status(409).json({ message: "Seule une demande acceptée par le chauffeur peut être traitée." });
    }

    request.contractConditions = contractConditions?.trim() || null;
    request.processedBy = req.user._id;
    request.processedAt = new Date();
    request.contractSentAt = new Date();
    await request.save();

    const driverOwnerId = request.driver?.owner;
    if (driverOwnerId) {
      await notify(
        driverOwnerId,
        "system",
        "📄 Contrat d'embauche disponible",
        `L'administration a finalisé le contrat ${request.contractType.toUpperCase()} pour ${request.driver.firstName} ${request.driver.lastName}. Téléchargez-le depuis votre tableau de bord.`,
        "/vendor/dashboard"
      );
    }

    res.json({ request });
  } catch (err) {
    logger.error("processEmploymentRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
