import { evaluerActivations, CHAMPS_PARTENAIRE } from "../services/activationPartenaire.js";
import mongoose from "mongoose";
import PartnerCrm, { STATUT_PIPELINE, STATUTS_CRM, STATUT_ABANDON, CONTACT_CHANNELS, PRIORITY_LEVELS } from "../models/PartnerCrm.js";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import Vehicle from "../models/Vehicle.js";
import Booking from "../models/Booking.js";
import IETransaction from "../models/IETransaction.js";
import logger from "../utils/logger.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isValidId = (v) => typeof v === "string" && mongoose.Types.ObjectId.isValid(v);

// ── Doublons (2026-10-28) ────────────────────────────────────────────────────
// Correspondances POSSIBLES, jamais une fusion : même e-mail, même téléphone
// (huit derniers chiffres, indicatif et séparateurs ignorés) ou même nom
// d'entreprise à la casse près — dans le CRM, et parmi les comptes partenaires
// déjà inscrits. L'équipe décide ; la création peut être confirmée.
const huitChiffres = (tel) => String(tel || "").replace(/\D/g, "").slice(-8);
const regexTel = (tel) => {
  const d = huitChiffres(tel);
  return d.length === 8 ? new RegExp(`${d.split("").join("\\D*")}\\D*$`) : null;
};

export async function correspondancesPossibles({ entreprise, contactEmail, contactTel }, exclureId = null) {
  const email = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
  const tel = regexTel(contactTel);
  const nom = entreprise?.trim() ? new RegExp(`^\\s*${escapeRegex(entreprise.trim())}\\s*$`, "i") : null;
  const ouCrm = [email && { contactEmail: email }, tel && { contactTel: tel }, nom && { entreprise: nom }].filter(Boolean);
  const ouUser = [email && { email }, tel && { phone: tel }].filter(Boolean);
  const [crm, comptes] = await Promise.all([
    ouCrm.length ? PartnerCrm.find({ $or: ouCrm, ...(exclureId ? { _id: { $ne: exclureId } } : {}) })
      .select("referenceNumber entreprise contactEmail contactTel statut").limit(10).lean() : [],
    ouUser.length ? User.find({ role: "partenaire", $or: ouUser }).select("firstName lastName email phone").limit(10).lean() : [],
  ]);
  const raisons = (x, champs) => champs.filter(([cle, test]) => test && test(x[cle])).map(([cle]) => cle);
  return [
    ...crm.map((c) => ({ type: "prospect", _id: c._id, libelle: `${c.entreprise} (${c.referenceNumber || "—"})`, statut: c.statut,
      motifs: raisons(c, [["contactEmail", email && ((v) => v === email)], ["contactTel", tel && ((v) => tel.test(v || ""))], ["entreprise", nom && ((v) => nom.test(v || ""))]]) })),
    ...comptes.map((u) => ({ type: "compte", _id: u._id, libelle: `${u.firstName || ""} ${u.lastName || ""} — ${u.email}`.trim(),
      motifs: raisons(u, [["email", email && ((v) => v === email)], ["phone", tel && ((v) => tel.test(v || ""))]]) })),
  ];
}

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

  const vehicles = await Vehicle.find({ owner: linkedUserId }).limit(0).select("_id").lean();
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
    const { statut, pays, secteur, assignedTo, search, source, aRelancer, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (statut && STATUTS_CRM.includes(statut)) filter.statut = statut;
    if (source) filter.source = { $regex: escapeRegex(String(source).slice(0, 100)), $options: "i" };
    // Échéance dépassée ou du jour, hors prospects abandonnés.
    if (aRelancer === "1" || aRelancer === "true") {
      const finJour = new Date(); finJour.setHours(23, 59, 59, 999);
      filter.nextFollowUpDate = { $ne: null, $lte: finJour };
      if (!filter.statut) filter.statut = { $ne: STATUT_ABANDON };
    }
    if (pays) filter.pays = String(pays).toUpperCase();
    if (secteur) filter.secteur = { $regex: escapeRegex(String(secteur).slice(0, 100)), $options: "i" };
    if (assignedTo && isValidId(assignedTo)) filter.assignedTo = assignedTo;
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { entreprise: { $regex: safe, $options: "i" } },
        { contactNom: { $regex: safe, $options: "i" } },
        { contactEmail: { $regex: safe, $options: "i" } },
        { contactTel: { $regex: safe, $options: "i" } },
        { referenceNumber: { $regex: safe, $options: "i" } },
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

    // Statut RÉEL des prospects devenus partenaires (inscrit / vérifié /
    // activé, calculé — services/activationPartenaire.js), à côté du statut
    // de pipeline saisi par l'équipe commerciale.
    const lies = items.map((i) => i.linkedUserId?._id || i.linkedUserId).filter(Boolean);
    if (lies.length) {
      const users = await User.find({ _id: { $in: lies }, role: "partenaire" }).select(CHAMPS_PARTENAIRE).lean();
      const act = await evaluerActivations(users);
      for (const i of items) {
        const a = act.get(String(i.linkedUserId?._id || i.linkedUserId));
        if (a) i.activation = { statut: a.statut, manquants: a.manquants.map((m) => m.code), offres: a.offres.total, demandesRecues: a.premieresDemandes.recues };
      }
    }
    res.json({ items, total, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.error("partnerCrm.adminList:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-crm/admin/stats ─────────────────────────────────────────
export const adminStats = async (req, res) => {
  try {
    const finJour = new Date(); finJour.setHours(23, 59, 59, 999);
    const [total, byStatut, aRelancer, lies] = await Promise.all([
      PartnerCrm.countDocuments(),
      PartnerCrm.aggregate([{ $group: { _id: "$statut", count: { $sum: 1 } } }]),
      PartnerCrm.countDocuments({ nextFollowUpDate: { $ne: null, $lte: finJour }, statut: { $ne: STATUT_ABANDON } }),
      PartnerCrm.distinct("linkedUserId", { linkedUserId: { $ne: null } }),
    ]);
    const counts = Object.fromEntries(STATUTS_CRM.map((s) => [s, 0]));
    for (const g of byStatut) if (g._id in counts) counts[g._id] = g.count;

    // Activation RÉELLE des comptes liés (calculée), à côté des étapes saisies
    // à la main : « Actif » dans le pipeline n'est qu'une déclaration.
    const activationReelle = { comptesLies: 0, inscrit: 0, verifie: 0, active: 0, suspendu: 0 };
    if (lies.length) {
      const users = await User.find({ _id: { $in: lies }, role: "partenaire" }).select(CHAMPS_PARTENAIRE).lean();
      for (const a of (await evaluerActivations(users)).values()) {
        activationReelle.comptesLies += 1;
        activationReelle[a.statut] += 1;
      }
    }
    res.json({ total, byStatut: counts, aRelancer, activationReelle });
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
      .populate("echanges.par", "firstName lastName")
      .lean();
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });

    const liveStats = await computeLinkedStats(doc.linkedUserId?._id || doc.linkedUserId);
    let activation = null;
    const lie = doc.linkedUserId?._id || doc.linkedUserId;
    if (lie) {
      const u = await User.findOne({ _id: lie, role: "partenaire" }).select(CHAMPS_PARTENAIRE).lean();
      if (u) activation = (await evaluerActivations([u])).get(String(u._id)) || null;
    }
    const doublons = await correspondancesPossibles(doc, doc._id);
    res.json({ crm: doc, liveStats, activation, doublons });
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
      source, assignedTo, priority, confirmerDoublon,
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

    // Doublon possible : on le montre, on ne bloque pas définitivement —
    // deux filiales peuvent partager un standard téléphonique.
    if (confirmerDoublon !== true) {
      const doublons = await correspondancesPossibles({ entreprise, contactEmail, contactTel });
      if (doublons.length) {
        return res.status(409).json({ code: "DOUBLON_POSSIBLE", message: "Ce prospect ressemble à une fiche ou à un compte existant.", doublons });
      }
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
    if (b.prochaineAction !== undefined) update.prochaineAction = String(b.prochaineAction || "").trim().slice(0, 300);
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
    const { statut, motif } = req.body;
    if (!statut || !STATUTS_CRM.includes(statut)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    const motifPropre = String(motif || "").trim().slice(0, 500);
    if (statut === STATUT_ABANDON && !motifPropre) {
      return res.status(400).json({ message: "Indiquez le motif de l'abandon." });
    }

    const doc = await PartnerCrm.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });

    doc.statut = statut;
    doc.motifAbandon = statut === STATUT_ABANDON ? motifPropre : null;
    if (statut === "INSCRIT" && !doc.dateInscription) doc.dateInscription = new Date();
    pushStatusHistory(doc, statut, req.user.id);
    await doc.save();

    res.json({ success: true, statut: doc.statut, dateInscription: doc.dateInscription, motifAbandon: doc.motifAbandon });
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
    // Un prospect abandonné qui s'inscrit quand même revient dans le pipeline.
    if (doc.statut === STATUT_ABANDON || STATUT_PIPELINE.indexOf(doc.statut) < inscritIdx) {
      doc.statut = "INSCRIT";
      doc.motifAbandon = null;
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

// ── POST /api/partner-crm/admin/:id/echanges ─────────────────────────────────
// Ajoute un échange réellement eu lieu ; met à jour « dernier contact », et en
// option la prochaine action et son échéance.
export const adminAddEchange = async (req, res) => {
  try {
    const { canal = "other", resume, date, prochaineAction, nextFollowUpDate } = req.body || {};
    const texte = String(resume || "").trim().slice(0, 2000);
    if (!texte) return res.status(400).json({ message: "Résumez l'échange." });
    if (!CONTACT_CHANNELS.includes(canal) || canal === "") return res.status(400).json({ message: "Canal invalide." });
    const quand = date ? new Date(date) : new Date();
    if (Number.isNaN(quand.getTime()) || quand > new Date(Date.now() + 86400000)) {
      return res.status(400).json({ message: "Date invalide : un échange enregistré a déjà eu lieu." });
    }

    const doc = await PartnerCrm.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Prospect introuvable." });
    doc.echanges.push({ date: quand, canal, resume: texte, par: req.user._id || req.user.id });
    if (!doc.lastContactDate || quand >= doc.lastContactDate) {
      doc.lastContactDate = quand;
      doc.lastContactChannel = canal;
    }
    if (prochaineAction !== undefined) doc.prochaineAction = String(prochaineAction || "").trim().slice(0, 300);
    if (nextFollowUpDate !== undefined) doc.nextFollowUpDate = nextFollowUpDate ? new Date(nextFollowUpDate) : null;
    await doc.save();
    res.status(201).json({ success: true, echanges: doc.echanges, lastContactDate: doc.lastContactDate });
  } catch (err) {
    logger.error("partnerCrm.adminAddEchange:", err);
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
