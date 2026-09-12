/**
 * VIT AUTO — Rapport hebdomadaire du funnel de vente aux administrateurs
 *
 * Le funnel (leads → demandes d'essai → essais → opportunités → ventes) n'est
 * visible que dans l'onglet admin « Leads vente » : personne ne l'ouvre par
 * réflexe. Ce rapport porte les chiffres de la semaine écoulée jusqu'aux
 * admins chaque lundi — et surtout ce qui demande une action : leads en
 * qualification, ventes à confirmer, partenaires qui ne répondent pas dans
 * les 2 h.
 *
 * Même mécanique que monthlyPartnerReport.js : pas de gabarit d'e-mail
 * dédié (toute Notification part aussi par e-mail), pas de job Redis (scan
 * quotidien en mémoire sous verrou multi-instances), marqueur « dernier envoi »
 * en base pour ne jamais envoyer deux fois ni sauter une semaine si le
 * serveur était arrêté lundi.
 */
import logger from "./logger.js";
import SalesLead from "../models/SalesLead.js";
import User from "../models/User.js";
import SchedulerLock, { avecVerrou } from "./schedulerLock.js";
import { notifyAdmins } from "./notifyAdmins.js";
import { getSalesLeadConfig } from "../services/salesLeadService.js";
import { nonBloquant } from "./nonBloquant.js";

const MARQUEUR = "weeklyFunnelReport:lastSentAt";

// Lundi 00:00 (heure du serveur) de la semaine de `maintenant`.
export function debutDeSemaine(maintenant = new Date()) {
  const d = new Date(maintenant);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Dû si aucun rapport n'a été envoyé depuis le lundi de la semaine courante.
export function rapportDu(lastSentAt, maintenant = new Date()) {
  if (!lastSentAt) return true;
  return new Date(lastSentAt) < debutDeSemaine(maintenant);
}

export async function calculerResume(depuis, jusqua, cfg) {
  const leads = await SalesLead.find({ createdAt: { $gte: depuis, $lt: jusqua } })
    .select("status milestones sla sale commission qualification partner").lean();
  const enCours = await SalesLead.find({ status: { $in: ["QUALIFYING", "SALE_PENDING", "SENT_TO_PARTNER"] } })
    .select("status milestones partner reference").populate("partner", "firstName lastName").lean();

  const sold = leads.filter((l) => l.status === "SOLD");
  const responses = leads.map((l) => l.sla?.responseTimeMs).filter((v) => Number.isFinite(v));
  const slaMs = (cfg.responseSlaMinutes || 120) * 60000;
  const horsDelai = responses.filter((v) => v > slaMs).length;

  // Partenaires en retard de réponse en ce moment (au-delà du SLA).
  const retards = enCours.filter((l) => l.status === "SENT_TO_PARTNER" && l.milestones?.sentToPartnerAt
    && Date.now() - new Date(l.milestones.sentToPartnerAt).getTime() > slaMs);
  const parPartenaire = {};
  for (const l of retards) {
    const nom = l.partner ? `${l.partner.firstName || ""} ${l.partner.lastName || ""}`.trim() : "partenaire inconnu";
    parPartenaire[nom] = (parPartenaire[nom] || 0) + 1;
  }

  return {
    leads: leads.length,
    demandes: leads.filter((l) => l.milestones?.sentToPartnerAt).length,
    essais: leads.filter((l) => l.milestones?.scheduledAt).length,
    realises: leads.filter((l) => l.milestones?.completedAt).length,
    opportunites: leads.filter((l) => l.milestones?.interestedAt || l.milestones?.negotiationAt).length,
    ventes: sold.length,
    caUSD: Math.round(sold.reduce((a, l) => a + (l.sale?.finalPriceUSD || 0), 0)),
    commissionUSD: Math.round(sold.reduce((a, l) => a + (l.commission?.amountUSD || 0), 0) * 100) / 100,
    reponseMoyenneMin: responses.length ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length / 60000) : null,
    horsDelai,
    aQualifier: enCours.filter((l) => l.status === "QUALIFYING").length,
    ventesAConfirmer: enCours.filter((l) => l.status === "SALE_PENDING").length,
    retards: Object.entries(parPartenaire).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

export function composerMessage(r, depuis, jusqua) {
  const fmt = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const periode = `${fmt(depuis)} → ${fmt(new Date(jusqua.getTime() - 1))}`;
  if (!r.leads && !r.aQualifier && !r.ventesAConfirmer) {
    return `Semaine ${periode} : aucune demande d'essai reçue. Rien en attente.`;
  }
  const parties = [
    `${r.leads} lead${r.leads > 1 ? "s" : ""}`,
    `${r.demandes} transmis${r.demandes > 1 ? "es" : "e"} aux vendeurs`,
    `${r.essais} essai${r.essais > 1 ? "s" : ""} confirmé${r.essais > 1 ? "s" : ""}`,
    `${r.realises} réalisé${r.realises > 1 ? "s" : ""}`,
    `${r.opportunites} opportunité${r.opportunites > 1 ? "s" : ""}`,
    `${r.ventes} vente${r.ventes > 1 ? "s" : ""}`,
  ];
  let message = `Semaine ${periode} : ${parties.join(", ")}.`;
  if (r.ventes) message += ` CA généré ≈ ${r.caUSD} USD, commissions ${r.commissionUSD} USD.`;
  if (r.reponseMoyenneMin != null) {
    message += ` Réponse partenaire moyenne : ${r.reponseMoyenneMin} min${r.horsDelai ? ` (${r.horsDelai} au-delà du délai)` : ""}.`;
  }
  const actions = [];
  if (r.aQualifier) actions.push(`${r.aQualifier} lead${r.aQualifier > 1 ? "s" : ""} à qualifier`);
  if (r.ventesAConfirmer) actions.push(`${r.ventesAConfirmer} vente${r.ventesAConfirmer > 1 ? "s" : ""} à confirmer`);
  if (r.retards.length) actions.push(`sans réponse partenaire : ${r.retards.map(([nom, n]) => `${nom} (${n})`).join(", ")}`);
  if (actions.length) message += ` À traiter : ${actions.join(" ; ")}.`;
  return message;
}

export async function envoyerRapportHebdo(maintenant = new Date()) {
  try {
    const marqueur = await SchedulerLock.findById(MARQUEUR).lean();
    if (!rapportDu(marqueur?.acquiredAt, maintenant)) return { sent: false };
    const admins = await User.countDocuments({ role: "admin", isActive: true });
    if (!admins) return { sent: false };

    const jusqua = debutDeSemaine(maintenant);
    const depuis = new Date(jusqua.getTime() - 7 * 86400000);
    const cfg = await getSalesLeadConfig();
    const resume = await calculerResume(depuis, jusqua, cfg);
    await notifyAdmins("sales_lead", "📊 Funnel vente — rapport de la semaine", composerMessage(resume, depuis, jusqua), "/admin?tab=sales_leads");
    await SchedulerLock.updateOne({ _id: MARQUEUR }, { $set: { acquiredAt: maintenant, holder: "weeklyFunnelReport" } }, { upsert: true });
    logger.info("[WeeklyFunnelReport] Rapport envoyé", resume);
    return { sent: true, resume };
  } catch (err) {
    logger.error("envoyerRapportHebdo:", err);
    return { sent: false, error: err.message };
  }
}

let _interval = null;
export function startWeeklyFunnelReportScheduler() {
  if (_interval) return;
  setTimeout(() => avecVerrou("weeklyFunnelReport", 10 * 60 * 1000, () => envoyerRapportHebdo()).catch(nonBloquant("weeklyFunnelReport")), 15 * 60 * 1000);
  _interval = setInterval(() => avecVerrou("weeklyFunnelReport", 10 * 60 * 1000, () => envoyerRapportHebdo()).catch(nonBloquant("weeklyFunnelReport")), 6 * 60 * 60 * 1000);
}
