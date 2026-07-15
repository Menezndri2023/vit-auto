import logger from "../utils/logger.js";
import InsuranceRequest from "../models/InsuranceRequest.js";
import Notification from "../models/Notification.js";

async function notify(userId, titre, message) {
  try {
    await Notification.create({ user: userId, titre, message, type: "system" });
    if (global._io) global._io.to(`user_${userId}`).emit("notification", { titre, message });
  } catch { /* non-bloquant */ }
}

// ── POST /api/insurance ─────────────────────────────────────────────────────
export const createRequest = async (req, res) => {
  try {
    const { type, vehicle, vehicleInfo, coveragePeriodMonths, notes } = req.body;
    if (!["auto", "location", "import_export"].includes(type)) {
      return res.status(400).json({ message: "Type d'assurance invalide." });
    }
    const request = await InsuranceRequest.create({
      client: req.user._id,
      type,
      vehicle: vehicle || null,
      vehicleInfo: (vehicleInfo || "").slice(0, 300),
      coveragePeriodMonths: Number(coveragePeriodMonths) || 12,
      notes: (notes || "").slice(0, 1000),
    });
    res.status(201).json({ request });
  } catch (err) {
    logger.error("createInsuranceRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/insurance/mine ──────────────────────────────────────────────────
export const getMyRequests = async (req, res) => {
  try {
    const requests = await InsuranceRequest.find({ client: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/insurance/admin/list ────────────────────────────────────────────
export const getAllRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const requests = await InsuranceRequest.find(filter)
      .populate("client",  "firstName lastName email phone")
      .populate("vehicle", "title marque modele")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ requests });
  } catch (err) {
    logger.error("getAllInsuranceRequests:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/insurance/:id/decision (admin) ────────────────────────────────
export const setDecision = async (req, res) => {
  try {
    const { status, premium, devise, note } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Décision invalide." });
    }
    const request = await InsuranceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Demande introuvable." });

    request.status       = status;
    request.premium       = status === "approved" ? (Number(premium) || null) : null;
    request.devise         = devise || request.devise;
    request.decisionNote  = note || null;
    request.decisionAt    = new Date();
    request.decisionBy    = req.user._id;
    await request.save();

    const label = status === "approved" ? "✅ Assurance approuvée" : "❌ Demande d'assurance refusée";
    const premiumMsg = status === "approved" && request.premium ? ` Prime proposée : ${Number(request.premium).toLocaleString("fr-FR")} ${request.devise}.` : "";
    await notify(request.client, label, `Votre demande d'assurance a été traitée.${premiumMsg}${note ? ` Note : ${note}` : ""}`);

    res.json({ success: true, request });
  } catch (err) {
    logger.error("setInsuranceDecision:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
