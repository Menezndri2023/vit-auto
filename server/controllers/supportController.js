// ═══════════════════════════════════════════════════════════════════════════
// ASSISTANCE — billetterie, avec file prioritaire pour les abonnés
// ═══════════════════════════════════════════════════════════════════════════
// « Assistance premium » ne peut pas se réduire à une mention sur la page
// Tarifs : tant qu'aucune file n'existe, tout le monde écrit au même e-mail et
// l'avantage vendu n'a aucune traduction. Cette billetterie donne au palier ce
// qu'il promet — un délai de première réponse annoncé, et une place en tête de
// file — sans fermer l'assistance aux comptes gratuits, qui gardent le même
// canal avec un délai plus long.
import logger from "../utils/logger.js";
import SupportTicket from "../models/SupportTicket.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import Notification from "../models/Notification.js";
import { planEffectif, slaHeuresDuPlan, planOuvre } from "../services/planAccess.js";
import { planRank } from "../constants/subscriptionPlans.js";

const CATEGORIES = ["billing", "kyc", "booking", "vehicle", "partner", "technical", "other"];
const STATUTS    = ["open", "in_progress", "waiting_user", "resolved", "closed"];
const STATUTS_CLOS = ["resolved", "closed"];

// Priorité déduite du palier, jamais choisie par l'auteur : laisser un
// utilisateur cocher « urgent » lui-même vide la notion de priorité en une
// semaine — tout le monde coche urgent.
const PRIORITE_PAR_PLAN = {
  free:            "low",
  individuel_plus: "medium",
  business:        "high",
  exportateur:     "urgent",
};

// Un ticket de facturation ou de KYC bloque l'activité du partenaire : il monte
// d'un cran, quel que soit le palier. Un compte gratuit bloqué sur son KYC ne
// peut littéralement rien faire sur la plateforme.
const CRAN = ["low", "medium", "high", "urgent"];
const monterDUnCran = (p) => CRAN[Math.min(CRAN.indexOf(p) + 1, CRAN.length - 1)];
const CATEGORIES_BLOQUANTES = ["billing", "kyc"];

const MAX_TICKETS_OUVERTS = 10;

// Vue renvoyée à l'auteur : l'identité de l'agent assigné ne le regarde pas, et
// `assignedTo` peuplé exposerait le compte administrateur.
const vueAuteur = (t) => ({
  _id: t._id,
  subject: t.subject,
  category: t.category,
  priority: t.priority,
  status: t.status,
  plan: t.plan,
  slaDueAt: t.slaDueAt,
  premierRetourFait: !!t.firstAdminReplyAt,
  messages: (t.messages || []).map((m) => ({
    content: m.content, isAdmin: m.isAdmin, createdAt: m.createdAt,
    auteur: m.isAdmin ? "Support VIT AUTO" : "Vous",
  })),
  createdAt: t.createdAt,
  lastReplyAt: t.lastReplyAt,
  rating: t.rating,
});

// ── POST /api/support/tickets — ouvrir un ticket ───────────────────────────
export const createTicket = async (req, res) => {
  try {
    const { subject, category, content } = req.body || {};
    if (!subject?.trim() || !content?.trim()) {
      return res.status(400).json({ message: "Un objet et un message sont requis." });
    }
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "Catégorie inconnue." });
    }

    // Garde-fou anti-inondation : dix dossiers ouverts simultanément par un
    // même compte relèvent d'un problème unique mal découpé, ou d'un abus.
    const ouverts = await SupportTicket.countDocuments({
      userId: req.user._id, status: { $nin: STATUTS_CLOS },
    });
    if (ouverts >= MAX_TICKETS_OUVERTS) {
      return res.status(429).json({
        message: `Vous avez déjà ${ouverts} demandes en cours. Complétez-en une avant d'en ouvrir une nouvelle.`,
      });
    }

    // Le plan du TITULAIRE : un agent d'équipe bénéficie de l'assistance que
    // son employeur paie.
    const plan = await planEffectif(req.user.teamOf || req.user._id);
    const cat = category || "other";
    let priority = PRIORITE_PAR_PLAN[plan] || "low";
    if (CATEGORIES_BLOQUANTES.includes(cat)) priority = monterDUnCran(priority);

    const heures = slaHeuresDuPlan(plan);
    const ticket = await SupportTicket.create({
      userId: req.user._id,
      subject: subject.trim().slice(0, 200),
      category: cat,
      priority,
      plan,
      slaDueAt: new Date(Date.now() + heures * 60 * 60 * 1000),
      messages: [{ senderId: req.user._id, content: content.trim(), isAdmin: false }],
    });

    await notifyAdmins(
      "support_ticket",
      `Assistance ${priority === "urgent" ? "URGENTE " : ""}— ${ticket.subject}`,
      `${[req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email} (plan ${plan}) — réponse attendue sous ${heures} h.`,
      "/admin?tab=assistance"
    );

    res.status(201).json({
      ticket: vueAuteur(ticket),
      // Le partenaire doit voir ce que son palier lui vaut au moment même où il
      // en bénéficie : c'est là que l'avantage devient tangible.
      delaiReponseHeures: heures,
      prioritaire: planOuvre(plan, "assistancePremium"),
    });
  } catch (err) {
    logger.error("createTicket:", err);
    res.status(500).json({ message: "Erreur ouverture du ticket.", error: err.message });
  }
};

// ── GET /api/support/tickets — mes tickets ─────────────────────────────────
export const getMyTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id })
      .sort({ updatedAt: -1 }).limit(100).lean();
    const plan = await planEffectif(req.user.teamOf || req.user._id);
    res.json({
      tickets: tickets.map(vueAuteur),
      delaiReponseHeures: slaHeuresDuPlan(plan),
      prioritaire: planOuvre(plan, "assistancePremium"),
    });
  } catch (err) {
    logger.error("getMyTickets:", err);
    res.status(500).json({ message: "Erreur récupération des tickets.", error: err.message });
  }
};

// ── GET /api/support/tickets/:id ───────────────────────────────────────────
export const getTicket = async (req, res) => {
  try {
    const t = await SupportTicket.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ message: "Ticket introuvable." });
    // Comparaison en chaîne : deux ObjectId égaux ne le sont pas avec `!==`,
    // et l'écrire ainsi laisserait passer TOUS les tickets d'autrui.
    if (String(t.userId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Ce ticket ne vous appartient pas." });
    }
    res.json({ ticket: vueAuteur(t) });
  } catch (err) {
    logger.error("getTicket:", err);
    res.status(500).json({ message: "Erreur récupération du ticket.", error: err.message });
  }
};

// ── POST /api/support/tickets/:id/messages — répondre ──────────────────────
export const replyToTicket = async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ message: "Message vide." });

    const t = await SupportTicket.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Ticket introuvable." });

    const estAdmin = req.user.role === "admin";
    if (!estAdmin && String(t.userId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Ce ticket ne vous appartient pas." });
    }
    if (t.status === "closed") {
      return res.status(409).json({ message: "Ce ticket est clos. Ouvrez-en un nouveau." });
    }

    t.messages.push({ senderId: req.user._id, content: content.trim(), isAdmin: estAdmin });
    if (estAdmin) {
      if (!t.firstAdminReplyAt) t.firstAdminReplyAt = new Date();
      // Une réponse du support attend un retour de l'auteur : garder « open »
      // laisserait le ticket en tête de file alors que la balle est ailleurs.
      if (t.status === "open") t.status = "waiting_user";
    } else if (t.status === "waiting_user") {
      t.status = "in_progress";
    }
    await t.save();

    if (estAdmin) {
      await Notification.create({
        user: t.userId,
        type: "support_reply",
        titre: "Réponse du support VIT AUTO",
        message: `Votre demande « ${t.subject} » a reçu une réponse.`,
        lien: `/support/${t._id}`,
      }).catch((e) => logger.error("notif réponse support (non bloquant) :", e.message));
    } else {
      await notifyAdmins("support_ticket", `Relance — ${t.subject}`,
        `${[req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email} a répondu.`, "/admin?tab=assistance");
    }

    res.json({ ticket: vueAuteur(t) });
  } catch (err) {
    logger.error("replyToTicket:", err);
    res.status(500).json({ message: "Erreur envoi du message.", error: err.message });
  }
};

// ── ADMIN : GET /api/support/admin/tickets — la file, dans l'ordre de traitement
export const adminListTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const filtre = status && STATUTS.includes(status) ? { status } : { status: { $nin: STATUTS_CLOS } };

    const tickets = await SupportTicket.find(filtre)
      .populate("userId", "firstName lastName email role country")
      .sort({ slaDueAt: 1, createdAt: 1 })
      .limit(300)
      .lean();

    // Tri sur `slaDueAt` seul : l'échéance porte DÉJÀ le palier (quatre heures
    // pour un exportateur, soixante-douze pour un compte gratuit). Trier
    // d'abord sur la priorité affamerait les comptes gratuits dès qu'un abonné
    // ouvre un ticket, alors que l'échéance fait remonter d'elle-même un
    // dossier gratuit ouvert depuis deux jours.
    const maintenant = Date.now();
    res.json({
      tickets: tickets.map((t) => ({
        ...t,
        enRetard: !!(t.slaDueAt && !t.firstAdminReplyAt && new Date(t.slaDueAt).getTime() < maintenant),
        rangPlan: planRank(t.plan),
      })),
      enRetard: tickets.filter((t) => t.slaDueAt && !t.firstAdminReplyAt && new Date(t.slaDueAt).getTime() < maintenant).length,
    });
  } catch (err) {
    logger.error("adminListTickets:", err);
    res.status(500).json({ message: "Erreur récupération de la file d'assistance.", error: err.message });
  }
};

// ── ADMIN : PATCH /api/support/admin/tickets/:id ───────────────────────────
export const adminUpdateTicket = async (req, res) => {
  try {
    const { status, priority, assignedTo } = req.body || {};
    const t = await SupportTicket.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Ticket introuvable." });

    if (status) {
      if (!STATUTS.includes(status)) return res.status(400).json({ message: "Statut inconnu." });
      t.status = status;
      if (status === "resolved" && !t.resolvedAt) t.resolvedAt = new Date();
      if (status === "closed"   && !t.closedAt)   t.closedAt   = new Date();
    }
    if (priority) {
      if (!CRAN.includes(priority)) return res.status(400).json({ message: "Priorité inconnue." });
      t.priority = priority;
    }
    if (assignedTo !== undefined) t.assignedTo = assignedTo || null;
    await t.save();

    if (status && STATUTS_CLOS.includes(status)) {
      await Notification.create({
        user: t.userId, type: "support_reply",
        titre: status === "resolved" ? "Demande résolue" : "Demande clôturée",
        message: `« ${t.subject} » — ${status === "resolved" ? "marquée comme résolue" : "clôturée"} par le support.`,
        lien: `/support/${t._id}`,
      }).catch((e) => logger.error("notif clôture support (non bloquant) :", e.message));
    }

    res.json({ ticket: vueAuteur(t) });
  } catch (err) {
    logger.error("adminUpdateTicket:", err);
    res.status(500).json({ message: "Erreur mise à jour du ticket.", error: err.message });
  }
};
