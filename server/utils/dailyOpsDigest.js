// ── Digest quotidien des admins — « à traiter aujourd'hui » ──────────────────
//
// Depuis la transmission directe au partenaire (2026-09-14), l'admin ne
// valide plus les demandes : son rôle est le SUIVI. Sans point de passage,
// une commande sans réponse, un litige, une alerte fraude ou une demande de
// secteur peuvent rester des jours sans qu'on les voie. Chaque matin (une
// seule fois par jour, quel que soit le nombre d'instances — SchedulerLock),
// les admins reçoivent une notification qui liste ce qui attend une action,
// avec des compteurs — et rien quand il n'y a rien à faire.
//
// Même construction que weeklyFunnelReport.js : calcul pur testable
// (calculerDigest), envoi idempotent (marqueur), planificateur verrouillé.
import logger from "./logger.js";
import Booking from "../models/Booking.js";
import SalesLead from "../models/SalesLead.js";
import User from "../models/User.js";
import DriverEmployment from "../models/DriverEmployment.js";
import PartnerSectorRequest from "../models/PartnerSectorRequest.js";
import SchedulerLock, { avecVerrou } from "./schedulerLock.js";
import { notifyAdmins } from "./notifyAdmins.js";
import { nonBloquant } from "./nonBloquant.js";
import { getSalesLeadConfig } from "../services/salesLeadService.js";

const MARQUEUR = "dailyOpsDigest:lastSent";
const HEURE_ENVOI = 7; // heure locale du serveur (UTC sur Render) à partir de laquelle le digest du jour est dû

export function digestDu(lastSentAt, maintenant = new Date()) {
  if (maintenant.getHours() < HEURE_ENVOI) return false;
  if (!lastSentAt) return true;
  const d = new Date(lastSentAt);
  return d.toDateString() !== maintenant.toDateString();
}

const h = (n) => n * 3600000;

export async function calculerDigest(maintenant = new Date()) {
  const cfg = await getSalesLeadConfig();
  const slaMs = (cfg.responseSlaMinutes || 120) * 60000;
  const [
    sansReponse, livreesNonConfirmees, litiges, fraudes, embauchesSansReponse, secteurs, leadsEnRetard, acomptesEnAttente,
  ] = await Promise.all([
    // Demandes transmises au partenaire depuis plus de 24 h, toujours sans réponse.
    Booking.find({ status: "pending", "adminValidation.status": "approved", partnerNotifiedAt: { $lte: new Date(maintenant - h(24)) } })
      .limit(0).select("reference type").lean(),
    // Pièces livrées dont le client n'a pas confirmé la réception depuis 3 jours.
    Booking.countDocuments({ type: "piece", status: "waiting_client_validation", updatedAt: { $lte: new Date(maintenant - h(72)) } }),
    Booking.countDocuments({ status: "disputed" }),
    // Alertes fraude des dernières 24 h (le score est informatif : l'admin décide a posteriori).
    Booking.find({ "fraudCheck.riskLevel": "high", "fraudCheck.checkedAt": { $gte: new Date(maintenant - h(24)) } }).limit(0).select("reference").lean(),
    DriverEmployment.countDocuments({ status: "pending", "adminReview.status": "forwarded", createdAt: { $lte: new Date(maintenant - h(48)) } }),
    PartnerSectorRequest.countDocuments({ status: "pending" }),
    SalesLead.find({ status: "SENT_TO_PARTNER", "milestones.sentToPartnerAt": { $lte: new Date(maintenant - slaMs) } }).limit(0).select("reference").lean(),
    Booking.countDocuments({ type: "piece", status: { $in: ["confirmed", "preparing"] }, "piece.depositUSD": { $gt: 0 }, "piece.depositReceivedAt": null, updatedAt: { $lte: new Date(maintenant - h(48)) } }),
  ]);
  return {
    sansReponse: sansReponse.length,
    sansReponseRefs: sansReponse.slice(0, 5).map((b) => b.reference),
    livreesNonConfirmees, litiges,
    fraudes: fraudes.length, fraudesRefs: fraudes.slice(0, 5).map((b) => b.reference),
    embauchesSansReponse, secteurs,
    leadsEnRetard: leadsEnRetard.length, leadsRefs: leadsEnRetard.slice(0, 5).map((l) => l.reference),
    acomptesEnAttente,
  };
}

export function composerDigest(d) {
  const lignes = [];
  if (d.sansReponse)          lignes.push(`${d.sansReponse} demande(s) sans réponse partenaire depuis 24 h (${d.sansReponseRefs.join(", ")}${d.sansReponse > 5 ? "…" : ""})`);
  if (d.leadsEnRetard)        lignes.push(`${d.leadsEnRetard} demande(s) d'essai hors délai vendeur (${d.leadsRefs.join(", ")}${d.leadsEnRetard > 5 ? "…" : ""})`);
  if (d.litiges)              lignes.push(`${d.litiges} litige(s) ouvert(s)`);
  if (d.fraudes)              lignes.push(`${d.fraudes} alerte(s) fraude en 24 h (${d.fraudesRefs.join(", ")})`);
  if (d.livreesNonConfirmees) lignes.push(`${d.livreesNonConfirmees} pièce(s) livrée(s) sans confirmation client depuis 3 j`);
  if (d.acomptesEnAttente)    lignes.push(`${d.acomptesEnAttente} commande(s) de pièce importée avec acompte non déclaré reçu depuis 48 h`);
  if (d.embauchesSansReponse) lignes.push(`${d.embauchesSansReponse} proposition(s) d'embauche sans réponse depuis 48 h`);
  if (d.secteurs)             lignes.push(`${d.secteurs} demande(s) d'ajout de secteur à valider`);
  return lignes;
}

export async function envoyerDigestQuotidien(maintenant = new Date()) {
  try {
    const marqueur = await SchedulerLock.findById(MARQUEUR).lean();
    if (!digestDu(marqueur?.acquiredAt, maintenant)) return { sent: false };
    if (!(await User.countDocuments({ role: "admin", isActive: true }))) return { sent: false };
    const digest = await calculerDigest(maintenant);
    const lignes = composerDigest(digest);
    // Marqueur posé même sans envoi : « rien à traiter » vaut digest du jour.
    await SchedulerLock.updateOne({ _id: MARQUEUR }, { $set: { acquiredAt: maintenant, holder: "dailyOpsDigest" } }, { upsert: true });
    if (!lignes.length) return { sent: false, digest, vide: true };
    await notifyAdmins("warning", `🗓️ À traiter aujourd'hui — ${lignes.length} point(s)`, lignes.join(" · ") + ".", "/admin?tab=bookings");
    logger.info("[DailyOpsDigest] Digest envoyé", digest);
    return { sent: true, digest, lignes };
  } catch (err) {
    logger.error("envoyerDigestQuotidien:", err);
    return { sent: false, error: err.message };
  }
}

let _interval = null;
export function startDailyOpsDigestScheduler() {
  if (_interval) return;
  setTimeout(() => avecVerrou("dailyOpsDigest", 5 * 60 * 1000, () => envoyerDigestQuotidien()).catch(nonBloquant("dailyOpsDigest")), 5 * 60 * 1000);
  _interval = setInterval(() => avecVerrou("dailyOpsDigest", 5 * 60 * 1000, () => envoyerDigestQuotidien()).catch(nonBloquant("dailyOpsDigest")), 60 * 60 * 1000);
}
