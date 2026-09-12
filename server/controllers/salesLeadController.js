// ── Prospects vente (demande d'essai) — contrôleur HTTP ─────────────────────
// Mince par construction : chaque action délègue à salesLeadService (seul
// détenteur de la machine à états) et se contente de résoudre QUI agit
// (client par session ou par jeton, partenaire propriétaire, admin) et de
// choisir la vue renvoyée (coordonnées masquées pour le partenaire avant le
// stade de divulgation — §19).
import mongoose from "mongoose";
import SalesLead from "../models/SalesLead.js";
import logger from "../utils/logger.js";
import { logAction } from "../middleware/auditLog.js";
import * as svc from "../services/salesLeadService.js";
import { SALE_LEAD_LABELS, SALE_LEAD_FUNNEL, SALE_LEAD_STATUSES, getWorkflow } from "../constants/leadWorkflows.js";

function fail(res, err, where) {
  if (err instanceof svc.LeadError) {
    return res.status(err.statusCode).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  logger.error(`${where}:`, err);
  return res.status(500).json({ message: "Erreur serveur." });
}

// ── Client ─────────────────────────────────────────────────────────────────

export const createLead = async (req, res) => {
  try {
    const { vehicleId, ...body } = req.body || {};
    // Pot de miel anti-robots : champ invisible, doit rester vide.
    if (body.website) return res.status(201).json({ ok: true });
    const { lead, duplicate } = await svc.createLead({ vehicleId, user: req.user || null, body, source: "API", ip: req.ip });
    res.status(duplicate ? 200 : 201).json({ lead: svc.clientView(lead), duplicate, accessPath: `/essai/${lead.reference}${lead.client.userId ? "" : `?t=${lead.clientAccessToken}`}` });
  } catch (err) { fail(res, err, "createLead"); }
};

export const getMyLeads = async (req, res) => {
  try {
    const leads = await SalesLead.find({ "client.userId": req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ leads: leads.map(svc.clientView) });
  } catch (err) { fail(res, err, "getMyLeads"); }
};

// Résout un lead pour le client : par jeton (invité) ou par session (compte
// propriétaire). Refuse tout le reste — un jeton absent ou faux ne révèle
// même pas l'existence de la référence.
async function resolveClientLead(req) {
  const ref = String(req.params.reference || "").toUpperCase();
  const lead = await SalesLead.findOne({ reference: ref });
  if (!lead) throw new svc.LeadError(404, "Dossier introuvable.");
  const token = req.query.t || req.body?.t || null;
  const isOwner = req.user && lead.client.userId && lead.client.userId.toString() === req.user._id.toString();
  const isAdmin = req.user?.role === "admin";
  const tokenOk = token && lead.clientAccessToken && token === lead.clientAccessToken;
  if (!isOwner && !tokenOk && !isAdmin) throw new svc.LeadError(404, "Dossier introuvable.");
  return lead;
}

export const getPublicLead = async (req, res) => {
  try {
    const lead = await resolveClientLead(req);
    res.json({ lead: svc.clientView(lead) });
  } catch (err) { fail(res, err, "getPublicLead"); }
};

export const clientRespondAlternative = async (req, res) => {
  try {
    const lead = await resolveClientLead(req);
    const { accept, newDate, newSlot, customSlot } = req.body || {};
    await svc.clientRespondAlternative(lead, { accept: !!accept, newDate, newSlot, customSlot, actorId: req.user?._id || null, source: req.user ? "DASHBOARD" : "PUBLIC_LINK" });
    res.json({ lead: svc.clientView(lead) });
  } catch (err) { fail(res, err, "clientRespondAlternative"); }
};

export const clientFollowUp = async (req, res) => {
  try {
    const lead = await resolveClientLead(req);
    await svc.clientFollowUpResponse(lead, { response: req.body?.response, note: req.body?.note, actorId: req.user?._id || null, source: req.user ? "DASHBOARD" : "PUBLIC_LINK" });
    res.json({ lead: svc.clientView(lead) });
  } catch (err) { fail(res, err, "clientFollowUp"); }
};

export const clientCancel = async (req, res) => {
  try {
    const lead = await resolveClientLead(req);
    const wf = getWorkflow(lead.workflow);
    if (wf.terminal.includes(lead.status)) throw new svc.LeadError(409, "Ce dossier est déjà clos.");
    await svc.cancelLead(lead, { by: "client", actorId: req.user?._id || null, source: req.user ? "DASHBOARD" : "PUBLIC_LINK", reason: req.body?.reason });
    res.json({ lead: svc.clientView(lead) });
  } catch (err) { fail(res, err, "clientCancel"); }
};

// ── Partenaire ─────────────────────────────────────────────────────────────

async function loadPartnerLead(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new svc.LeadError(404, "Dossier introuvable.");
  const lead = await SalesLead.findById(req.params.id);
  if (!lead) throw new svc.LeadError(404, "Dossier introuvable.");
  const isOwner = lead.partner.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") throw new svc.LeadError(403, "Accès refusé.");
  // Un partenaire ne connaît pas un lead encore en qualification chez VIT AUTO.
  if (req.user.role !== "admin" && ["NEW", "QUALIFYING"].includes(lead.status)) throw new svc.LeadError(404, "Dossier introuvable.");
  return lead;
}

function partnerFilter(req) {
  const filter = { partner: req.user._id, status: { $nin: ["NEW", "QUALIFYING"] } };
  if (req.query.businessId && mongoose.Types.ObjectId.isValid(req.query.businessId)) filter.businessId = req.query.businessId;
  if (req.query.status && SALE_LEAD_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  return filter;
}

export const getPartnerLeads = async (req, res) => {
  try {
    const leads = await SalesLead.find(partnerFilter(req)).sort({ updatedAt: -1 }).limit(300);
    res.json({ leads: leads.map(svc.partnerView), labels: SALE_LEAD_LABELS });
  } catch (err) { fail(res, err, "getPartnerLeads"); }
};

export const getPartnerStats = async (req, res) => {
  try {
    const filter = partnerFilter(req);
    delete filter.status;
    filter.status = { $nin: ["NEW", "QUALIFYING"] };
    const leads = await SalesLead.find(filter).select("status requestType milestones sla sale commission").lean();
    const stats = computeStats(leads);
    res.json({ stats });
  } catch (err) { fail(res, err, "getPartnerStats"); }
};

export function computeStats(leads) {
  const n = leads.length;
  const testDriveRequests = leads.filter((l) => l.requestType === "test_drive").length;
  const confirmed = leads.filter((l) => l.milestones?.scheduledAt).length;
  const completed = leads.filter((l) => l.milestones?.completedAt).length;
  const sold = leads.filter((l) => l.status === "SOLD");
  const responseTimes = leads.map((l) => l.sla?.responseTimeMs).filter((v) => Number.isFinite(v));
  const avgResponseMs = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;
  const revenueUSD = Math.round(sold.reduce((a, l) => a + (l.sale?.finalPriceUSD || 0), 0) * 100) / 100;
  const commissionUSD = Math.round(sold.reduce((a, l) => a + (l.commission?.amountUSD || 0), 0) * 100) / 100;
  const byStatus = {};
  for (const l of leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  return {
    leads: n, testDriveRequests, confirmed, completed, sales: sold.length,
    conversionRate: n ? Math.round((sold.length / n) * 1000) / 10 : 0,
    avgResponseMs, revenueUSD, commissionUSD, byStatus,
  };
}

export const partnerAccept = async (req, res) => {
  try {
    const lead = await loadPartnerLead(req);
    const { time, address, instructions, date } = req.body || {};
    await svc.partnerAccept(lead, { actorId: req.user._id, time, address, instructions, date });
    res.json({ lead: svc.partnerView(lead) });
  } catch (err) { fail(res, err, "partnerAccept"); }
};

export const partnerProposeAlternative = async (req, res) => {
  try {
    const lead = await loadPartnerLead(req);
    const { date, slot, time, note } = req.body || {};
    await svc.partnerProposeAlternative(lead, { actorId: req.user._id, date, slot, time, note });
    res.json({ lead: svc.partnerView(lead) });
  } catch (err) { fail(res, err, "partnerProposeAlternative"); }
};

export const partnerRefuse = async (req, res) => {
  try {
    const lead = await loadPartnerLead(req);
    await svc.partnerRefuse(lead, { actorId: req.user._id, reason: req.body?.reason, note: req.body?.note });
    res.json({ lead: svc.partnerView(lead) });
  } catch (err) { fail(res, err, "partnerRefuse"); }
};

export const partnerOutcome = async (req, res) => {
  try {
    const lead = await loadPartnerLead(req);
    const { testDrive, commercial, note, newDate, newTime, lostReason } = req.body || {};
    await svc.reportOutcome(lead, { actorId: req.user._id, testDrive, commercial, note, newDate, newTime, lostReason });
    res.json({ lead: svc.partnerView(lead) });
  } catch (err) { fail(res, err, "partnerOutcome"); }
};

export const partnerDeclareSale = async (req, res) => {
  try {
    const lead = await loadPartnerLead(req);
    const { finalPrice, currency, soldAt, note } = req.body || {};
    await svc.declareSale(lead, { actorId: req.user._id, finalPrice, currency, soldAt, note });
    res.json({ lead: svc.partnerView(lead) });
  } catch (err) { fail(res, err, "partnerDeclareSale"); }
};

export const partnerNote = async (req, res) => {
  try {
    const lead = await loadPartnerLead(req);
    lead.partnerNotes = String(req.body?.note || "").trim().slice(0, 2000) || null;
    svc.logEvent(lead, "partner_note", { actorType: "PARTNER", actorId: req.user._id, source: "DASHBOARD" });
    await lead.save();
    res.json({ lead: svc.partnerView(lead) });
  } catch (err) { fail(res, err, "partnerNote"); }
};

// ── Admin ──────────────────────────────────────────────────────────────────

export const adminList = async (req, res) => {
  try {
    const q = req.query || {};
    const filter = {};
    if (q.partner && mongoose.Types.ObjectId.isValid(q.partner)) filter.partner = q.partner;
    if (q.vehicle && mongoose.Types.ObjectId.isValid(q.vehicle)) filter.vehicle = q.vehicle;
    if (q.status && SALE_LEAD_STATUSES.includes(q.status)) filter.status = q.status;
    if (q.stage) {
      const stage = SALE_LEAD_FUNNEL.find((s) => s.key === q.stage);
      if (stage) filter.status = { $in: stage.statuses };
    }
    if (q.level && ["1", "2", "3"].includes(String(q.level))) filter["qualification.level"] = Number(q.level);
    if (q.city) filter.$or = [{ "client.city": new RegExp(q.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { "listingSnapshot.ville": new RegExp(q.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
    if (q.source) filter.source = q.source;
    if (q.from || q.to) {
      filter.createdAt = {};
      if (q.from) filter.createdAt.$gte = new Date(q.from);
      if (q.to)   filter.createdAt.$lte = new Date(q.to);
    }
    if (q.minPrice || q.maxPrice) {
      filter["listingSnapshot.priceUSD"] = {};
      if (q.minPrice) filter["listingSnapshot.priceUSD"].$gte = Number(q.minPrice);
      if (q.maxPrice) filter["listingSnapshot.priceUSD"].$lte = Number(q.maxPrice);
    }
    if (q.search) {
      const rx = new RegExp(String(q.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [...(filter.$or || []), { reference: rx }, { "client.firstName": rx }, { "client.lastName": rx }, { "client.phone": rx }, { "listingSnapshot.title": rx }];
    }
    const limit = Math.min(Number(q.limit) || 200, 500);
    const leads = await SalesLead.find(filter)
      .populate("partner", "firstName lastName email phone")
      .sort({ createdAt: -1 }).limit(limit);
    res.json({ leads: leads.map(svc.adminView), labels: SALE_LEAD_LABELS });
  } catch (err) { fail(res, err, "adminList"); }
};

export const adminFunnel = async (req, res) => {
  try {
    const filter = {};
    if (req.query.partner && mongoose.Types.ObjectId.isValid(req.query.partner)) filter.partner = req.query.partner;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to);
    }
    const leads = await SalesLead.find(filter).select("status requestType milestones sla sale commission qualification").lean();
    // Funnel cumulatif : un lead vendu a aussi été une demande, un essai, une
    // opportunité — chaque étape compte les leads qui l'ont ATTEINTE.
    const reached = {
      leads:         leads.length,
      requests:      leads.filter((l) => l.milestones?.sentToPartnerAt).length,
      test_drives:   leads.filter((l) => l.milestones?.scheduledAt).length,
      opportunities: leads.filter((l) => l.milestones?.interestedAt || l.milestones?.negotiationAt || l.milestones?.soldAt).length,
      negotiations:  leads.filter((l) => l.milestones?.negotiationAt || l.status === "SALE_PENDING" || l.status === "SOLD").length,
      sales:         leads.filter((l) => l.status === "SOLD").length,
    };
    const stats = computeStats(leads);
    const pendingQualification = leads.filter((l) => l.status === "QUALIFYING").length;
    const pendingSales = leads.filter((l) => l.status === "SALE_PENDING").length;
    res.json({ funnel: SALE_LEAD_FUNNEL.map((s) => ({ key: s.key, label: s.label, count: reached[s.key] })), stats, pendingQualification, pendingSales, labels: SALE_LEAD_LABELS });
  } catch (err) { fail(res, err, "adminFunnel"); }
};

async function loadAdminLead(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new svc.LeadError(404, "Dossier introuvable.");
  const lead = await SalesLead.findById(req.params.id).populate("partner", "firstName lastName email phone").populate("client.userId", "firstName lastName email phone");
  if (!lead) throw new svc.LeadError(404, "Dossier introuvable.");
  return lead;
}

export const adminGet = async (req, res) => {
  try {
    const lead = await loadAdminLead(req);
    res.json({ lead: svc.adminView(lead) });
  } catch (err) { fail(res, err, "adminGet"); }
};

export const adminQualify = async (req, res) => {
  try {
    const lead = await loadAdminLead(req);
    await svc.adminQualify(lead, { actorId: req.user._id, level: req.body?.level, transmit: req.body?.transmit !== false });
    await logAction(req, "sales_lead.qualify", "SalesLead", lead._id, { after: { status: lead.status, level: lead.qualification.level } });
    res.json({ lead: svc.adminView(lead) });
  } catch (err) { fail(res, err, "adminQualify"); }
};

export const adminConfirmSale = async (req, res) => {
  try {
    const lead = await loadAdminLead(req);
    await svc.confirmSale(lead, { actorId: req.user._id });
    await logAction(req, "sales_lead.confirm_sale", "SalesLead", lead._id, { after: { sale: lead.sale, commission: lead.commission } });
    res.json({ lead: svc.adminView(lead) });
  } catch (err) { fail(res, err, "adminConfirmSale"); }
};

export const adminRejectSale = async (req, res) => {
  try {
    const lead = await loadAdminLead(req);
    await svc.rejectSale(lead, { actorId: req.user._id, reason: req.body?.reason });
    await logAction(req, "sales_lead.reject_sale", "SalesLead", lead._id, { after: { reason: req.body?.reason } });
    res.json({ lead: svc.adminView(lead) });
  } catch (err) { fail(res, err, "adminRejectSale"); }
};

export const adminSetStatus = async (req, res) => {
  try {
    const lead = await loadAdminLead(req);
    const before = lead.status;
    await svc.adminSetStatus(lead, { actorId: req.user._id, status: req.body?.status, reason: req.body?.reason });
    await logAction(req, "sales_lead.status_override", "SalesLead", lead._id, { before, after: lead.status });
    res.json({ lead: svc.adminView(lead) });
  } catch (err) { fail(res, err, "adminSetStatus"); }
};

export const adminAssign = async (req, res) => {
  try {
    const lead = await loadAdminLead(req);
    const adminId = req.body?.adminId && mongoose.Types.ObjectId.isValid(req.body.adminId) ? req.body.adminId : req.user._id;
    lead.assignedAdmin = adminId;
    if (req.body?.internalNotes !== undefined) lead.internalNotes = String(req.body.internalNotes || "").slice(0, 3000) || null;
    svc.logEvent(lead, "admin_assigned", { actorType: "ADMIN", actorId: req.user._id, source: "DASHBOARD", metadata: { adminId } });
    await lead.save();
    res.json({ lead: svc.adminView(lead) });
  } catch (err) { fail(res, err, "adminAssign"); }
};
