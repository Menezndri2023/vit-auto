import mongoose from "mongoose";
import PartnerCrm, { STATUT_PIPELINE, CONTACT_CHANNELS, PRIORITY_LEVELS } from "../models/PartnerCrm.js";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import Vehicle from "../models/Vehicle.js";
import Booking from "../models/Booking.js";
import IETransaction from "../models/IETransaction.js";
import logger from "../utils/logger.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isValidId = (v) => typeof v === "string" && mongoose.Types.ObjectId.isValid(v);

const pushStatusHistory = (doc, statut, changedBy) => {
  doc.statusHistory.push({ statut, changedAt: new Date(), changedBy: changedBy || null });
};

// ── Auto-liaison best-effort : un prospect CRM dont l'email correspond à un
// User qui vient de s'inscrire/soumettre son dossier est automatiquement
// rattaché et poussé au moins jusqu'au statut INSCRIT. Ne doit jamais faire
// échouer l'appelant (inscription/soumission) — toute erreur est avalée.
export async function autoLinkProspect({ email, userId, businessId = null, onboardingId = null }) {
  if (!email || !userId) return;
  try {
    const crm = await PartnerCrm.findOne({ contactEmail: String(email).toLowerCase(), linkedUserId: null });
    if (!crm) return;

    crm.linkedUserId = userId;
    if (businessId) crm.linkedBusinessId = businessId;
    if (onboardingId) crm.linkedOnboardingId = onboardingId;

    const inscritIdx = STATUT_PIPELINE.indexOf("INSCRIT");
    if (STATUT_PIPELINE.indexOf(crm.statut) < inscritIdx) {
      crm.statut = "INSCRIT";
      pushStatusHistory(crm, "INSCRIT", null);
    }
    if (!crm.dateInscription) crm.dateInscription = new Date();

    await crm.save();
  } catch (err) {
    logger.error("autoLinkProspect:", err.message);
  }
}

// Stats live calculées uniquement quand le prospect est lié à un vrai compte —
// jamais stockées sur PartnerCrm pour éviter toute désynchronisation avec les
// données réelles. Même pattern d'agrégation que getPartnerStats
// (server/controllers/bookingController.js).
async function computeLinkedStats(linkedUserId) {
  if (!linkedUserId) return { nombreAnnonces: 0, transactionsCount: 0, chiffreAffairesGenere: 0 };

  const vehicles = await Vehicle.find({ owner: linkedUserId }).select("_id").lean();
  const vehicleIds = vehicles.map((v) => v._id);

  const [bookingAgg, ieAgg] = await Promise.all([
    vehicleIds.length
      ? Booking.aggregate([
          { $match: { vehicle: { $in: vehicleIds }, status: "completed" } },
          { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$transaction.finalAmount", { $ifNull: ["$montantTotal", 0] }] } } } },
        ])
      : [],
    IETransaction.aggregate([
      { $match: { partner: linkedUserId } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$payment.totalAmount", 0] } } } },
    ]),
  ]);

  const bookingStats = bookingAgg[0] || { count: 0, revenue: 0 };
  const ieStats = ieAgg[0] || { count: 0, revenue: 0 };

  return {
    nombreAnnonces: vehicleIds.length,
    transactionsCount: bookingStats.count + ieStats.count,
    chiffreAffairesGenere: bookingStats.revenue + ieStats.revenue,
  };
}

// ── GET /api/partner-crm/admin/list ──────────────────────────────────────────
export const adminList = async (req, res) => {
  try {
    const { statut, pays, secteur, assignedTo, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (statut && STATUT_PIPELINE.includes(statut)) filter.statut = statut;
    if (pays) filter.pays = String(pays).toUpperCase();
    if (secteur) filter.secteur = { $regex: escapeRegex(String(secteur).slice(0, 100)), $options: "i" };
    if (assignedTo && isValidId(assignedTo)) filter.assignedTo = assignedTo;
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { entreprise: { $regex: safe, $options: "i" } },
        { contactNom: { $regex: safe, $options: "i" } },
        { contactEmail: { $regex: safe, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const [items, total] = await Promise.all([
      PartnerCrm.find(filter)
        .populate("assignedTo", "firstName lastName email")
        .populate("linkedUserId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      PartnerCrm.countDocuments(filter),
    ]);

    res.json({ items, total, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.error("partnerCrm.adminList:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-crm/admin/stats ─────────────────────────────────────────
export const adminStats = async (req, res) => {
  try {
    const [total, byStatut] = await Promise.all([
      PartnerCrm.countDocuments(),
      PartnerCrm.aggregate([{ $group: { _id: "$statut", count: { $sum: 1 } } }]),
    ]);
    const counts = Object.fromEntries(STATUT_PIPELINE.map((s) => [s, 0]));
    for (const g of byStatut) if (g._id in counts) counts[g._id] = g.count;

    res.json({ total, byStatut: counts });
  } catch (err) {
    logger.error("partnerCrm.adminStats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-crm/admin/:id ───────────────────────────────────────────
export const adminGetOne = async (req, res) => {
  try {
    const doc = await PartnerCrm.findById(req.params.id)
      .populate("assignedTo", "firstName lastName email")
      .populate("linkedUserId", "firstName lastName email country")
      .populate("linkedBusinessId", "companyName country ville")
      .populate("linkedOnboardingId", "referenceNumber status")
      .populate("statusHistory.changedBy", "firstName lastName")
      .lean();
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });

    const liveStats = await computeLinkedStats(doc.linkedUserId?._id || doc.linkedUserId);
    res.json({ crm: doc, liveStats });
  } catch (err) {
    logger.error("partnerCrm.adminGetOne:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-crm/admin ──────────────────────────────────────────────
export const adminCreate = async (req, res) => {
  try {
    const {
      entreprise, pays, ville, secteur,
      contactNom, contactTel, contactEmail, website,
      source, assignedTo, priority,
    } = req.body;

    if (!entreprise?.trim()) {
      return res.status(400).json({ message: "Le nom de l'entreprise est requis." });
    }
    if (assignedTo && !isValidId(assignedTo)) {
      return res.status(400).json({ message: "Responsable commercial invalide." });
    }
    if (priority && !PRIORITY_LEVELS.includes(priority)) {
      return res.status(400).json({ message: "Priorité invalide." });
    }

    const doc = new PartnerCrm({
      entreprise: entreprise.trim(),
      pays: pays ? String(pays).toUpperCase() : null,
      ville: ville?.trim() || null,
      secteur: secteur?.trim() || null,
      contactNom: contactNom?.trim() || null,
      contactTel: contactTel?.trim() || null,
      contactEmail: contactEmail?.trim()?.toLowerCase() || null,
      website: website?.trim() || null,
      source: source?.trim() || null,
      assignedTo: assignedTo || null,
      priority: priority || "medium",
      createdBy: req.user.id,
    });
    pushStatusHistory(doc, "LEAD", req.user.id);
    await doc.save();

    res.status(201).json({ success: true, crm: doc });
  } catch (err) {
    logger.error("partnerCrm.adminCreate:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-crm/admin/:id ─────────────────────────────────────────
export const adminUpdate = async (req, res) => {
  try {
    const b = req.body || {};
    const update = {};

    const strField = (key, maxLen = 200) => {
      if (b[key] !== undefined) update[key] = b[key] === null ? null : String(b[key]).trim().slice(0, maxLen);
    };
    strField("entreprise");
    strField("ville");
    strField("secteur");
    strField("contactNom");
    strField("contactTel");
    strField("website");
    if (b.contactEmail !== undefined) update.contactEmail = b.contactEmail ? String(b.contactEmail).trim().toLowerCase() : null;
    if (b.pays !== undefined) update.pays = b.pays ? String(b.pays).toUpperCase() : null;
    if (b.internalNotes !== undefined) update.internalNotes = String(b.internalNotes).slice(0, 2000);
    if (b.source !== undefined) update.source = b.source ? String(b.source).trim().slice(0, 200) : null;
    if (Array.isArray(b.services)) update.services = b.services.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
    if (Array.isArray(b.documents)) {
      update.documents = b.documents
        .filter((d) => d?.url)
        .map((d) => ({ nom: String(d.nom || "").slice(0, 200), url: String(d.url).slice(0, 2000), uploadedAt: d.uploadedAt || new Date() }))
        .slice(0, 50);
    }
    if (b.contrat && typeof b.contrat === "object") {
      const c = b.contrat;
      update.contrat = {
        reference: c.reference ? String(c.reference).trim().slice(0, 100) : null,
        dateSignature: c.dateSignature ? new Date(c.dateSignature) : null,
        dateExpiration: c.dateExpiration ? new Date(c.dateExpiration) : null,
        url: c.url ? String(c.url).slice(0, 2000) : null,
      };
    }
    if (b.commission && typeof b.commission === "object") {
      update.commission = {
        taux: b.commission.taux !== undefined && b.commission.taux !== null ? Number(b.commission.taux) : null,
        notes: b.commission.notes ? String(b.commission.notes).trim().slice(0, 1000) : null,
      };
    }
    if (b.priority !== undefined && PRIORITY_LEVELS.includes(b.priority)) update.priority = b.priority;
    if (b.lastContactChannel !== undefined && CONTACT_CHANNELS.includes(b.lastContactChannel)) update.lastContactChannel = b.lastContactChannel;
    if (b.lastContactDate !== undefined) update.lastContactDate = b.lastContactDate ? new Date(b.lastContactDate) : null;
    if (b.nextFollowUpDate !== undefined) update.nextFollowUpDate = b.nextFollowUpDate ? new Date(b.nextFollowUpDate) : null;
    if (b.assignedTo !== undefined) {
      if (b.assignedTo && !isValidId(b.assignedTo)) return res.status(400).json({ message: "Responsable commercial invalide." });
      update.assignedTo = b.assignedTo || null;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide fournie." });
    }
    update.updatedAt = new Date();

    const doc = await PartnerCrm.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });

    res.json({ success: true, crm: doc });
  } catch (err) {
    logger.error("partnerCrm.adminUpdate:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-crm/admin/:id/statut ──────────────────────────────────
export const adminUpdateStatut = async (req, res) => {
  try {
    const { statut } = req.body;
    if (!statut || !STATUT_PIPELINE.includes(statut)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const doc = await PartnerCrm.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });

    doc.statut = statut;
    if (statut === "INSCRIT" && !doc.dateInscription) doc.dateInscription = new Date();
    pushStatusHistory(doc, statut, req.user.id);
    await doc.save();

    res.json({ success: true, statut: doc.statut, dateInscription: doc.dateInscription });
  } catch (err) {
    logger.error("partnerCrm.adminUpdateStatut:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-crm/admin/:id/link ────────────────────────────────────
export const adminLink = async (req, res) => {
  try {
    const { userId, businessId, onboardingId } = req.body;
    if (!userId || !isValidId(userId)) {
      return res.status(400).json({ message: "Compte utilisateur invalide." });
    }
    const user = await User.findById(userId).select("_id").lean();
    if (!user) return res.status(404).json({ message: "Compte utilisateur introuvable." });

    const doc = await PartnerCrm.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });

    doc.linkedUserId = userId;
    if (businessId && isValidId(businessId)) {
      const biz = await PartnerBusiness.findById(businessId).select("_id").lean();
      if (biz) doc.linkedBusinessId = businessId;
    }
    if (onboardingId && isValidId(onboardingId)) {
      const onboarding = await PartnerOnboarding.findById(onboardingId).select("_id").lean();
      if (onboarding) doc.linkedOnboardingId = onboardingId;
    }

    const inscritIdx = STATUT_PIPELINE.indexOf("INSCRIT");
    if (STATUT_PIPELINE.indexOf(doc.statut) < inscritIdx) {
      doc.statut = "INSCRIT";
      pushStatusHistory(doc, "INSCRIT", req.user.id);
    }
    if (!doc.dateInscription) doc.dateInscription = new Date();

    await doc.save();
    res.json({ success: true, crm: doc });
  } catch (err) {
    logger.error("partnerCrm.adminLink:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── DELETE /api/partner-crm/admin/:id ────────────────────────────────────────
export const adminDelete = async (req, res) => {
  try {
    const doc = await PartnerCrm.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });
    res.json({ success: true });
  } catch (err) {
    logger.error("partnerCrm.adminDelete:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
