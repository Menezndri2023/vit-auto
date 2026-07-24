import logger from "../utils/logger.js";
import ServiceRequest, { SERVICE_REQUEST_CATEGORIES } from "../models/ServiceRequest.js";
import Notification from "../models/Notification.js";
import { getServiceConfig } from "../services/pricingEngine.js";
import { generateGenericReceiptPDF } from "../utils/pdfGenerator.js";

const CATEGORY_LABELS = {
  inspection:      "Inspection indépendante",
  transport:       "Transport international",
  transit:         "Transit",
  douanes:         "Douanes",
  immatriculation: "Immatriculation",
  garantie:        "Garantie",
  financement:     "Financement",
  change_devises:  "Change de devises",
  sequestre:       "Séquestre / Escrow",
};

async function notify(userId, titre, message) {
  try {
    await Notification.create({ user: userId, titre, message, type: "system" });
    if (global._io) global._io.to(`user_${userId}`).emit("notification", { titre, message });
  } catch { /* non-bloquant */ }
}

// ── POST /api/service-requests ───────────────────────────────────────────────
export const createRequest = async (req, res) => {
  try {
    const { category, vehicle, vehicleInfo, details, notes } = req.body;
    if (!SERVICE_REQUEST_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Catégorie invalide. Attendu : ${SERVICE_REQUEST_CATEGORIES.join(", ")}.` });
    }
    const request = await ServiceRequest.create({
      client: req.user._id,
      category,
      vehicle: vehicle || null,
      vehicleInfo: (vehicleInfo || "").slice(0, 300),
      details: details && typeof details === "object" && !Array.isArray(details) ? details : {},
      notes: (notes || "").slice(0, 1000),
    });
    res.status(201).json({ request });
  } catch (err) {
    logger.error("createServiceRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/service-requests/mine ───────────────────────────────────────────
export const getMyRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ client: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/service-requests/admin/list ─────────────────────────────────────
export const getAllRequests = async (req, res) => {
  try {
    const { status, category } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    const requests = await ServiceRequest.find(filter)
      .populate("client",  "firstName lastName email phone")
      .populate("vehicle", "title marque modele")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ requests });
  } catch (err) {
    logger.error("getAllServiceRequests:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/service-requests/:id/decision (admin) ─────────────────────────
export const setDecision = async (req, res) => {
  try {
    const { status, quotedAmountUSD, note } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Décision invalide." });
    }
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Demande introuvable." });

    request.status = status;
    if (status === "approved") {
      const amount = Number(quotedAmountUSD) || 0;
      request.quotedAmountUSD = amount;
      const svc = await getServiceConfig(request.category);
      if (svc?.enabled) {
        const rate = svc.commissionRate || 0;
        request.commission = {
          rate,
          amount: Math.round((amount * rate + (svc.fixedFeeUSD || 0)) * 100) / 100,
        };
      } else {
        request.commission = { rate: null, amount: null };
      }
    } else {
      request.quotedAmountUSD = null;
      request.commission = { rate: null, amount: null };
    }
    request.decisionNote = note || null;
    request.decisionAt   = new Date();
    request.decisionBy   = req.user._id;
    await request.save();

    const label = CATEGORY_LABELS[request.category] || request.category;
    const title = status === "approved" ? "✅ Demande approuvée" : "❌ Demande refusée";
    const quoteMsg = status === "approved" && request.quotedAmountUSD
      ? ` Devis proposé : ${request.quotedAmountUSD} USD.`
      : "";
    await notify(request.client, title, `Votre demande "${label}" a été traitée.${quoteMsg}${note ? ` Note : ${note}` : ""}`);

    res.json({ success: true, request });
  } catch (err) {
    logger.error("setServiceRequestDecision:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/services/:id/receipt — reçu PDF du devis payé ──────────────────
// Même manque que l'assurance : aucun reçu n'existait pour un devis de
// service payé (inspection, transport, douanes...). Trouvé en audit.
export const getRequestReceipt = async (req, res) => {
  try {
    const request = await ServiceRequest.findById(req.params.id).populate("client", "firstName lastName email");
    if (!request) return res.status(404).json({ message: "Demande introuvable." });
    if (req.user.role !== "admin" && request.client._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    if (!request.isPaid) return res.status(409).json({ message: "Ce devis n'a pas encore été payé." });

    generateGenericReceiptPDF({
      reference:   `VIT-SRV-${request._id.toString().slice(-8).toUpperCase()}`,
      title:       `Service — ${CATEGORY_LABELS[request.category] || request.category}`,
      clientName:  `${request.client.firstName} ${request.client.lastName}`,
      clientEmail: request.client.email,
      amount:      request.quotedAmountUSD,
      currency:    "USD",
      paidAt:      request.paidAt,
      method:      "Paiement en ligne",
    }, res);
  } catch (err) {
    logger.error("getServiceRequestReceipt:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
