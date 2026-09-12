/**
 * VIT AUTO — Alerte sur les échecs d'envoi (e-mail, SMS, WhatsApp, push)
 *
 * Le journal des communications (CommunicationLog) enregistre chaque envoi
 * et son statut, mais l'onglet « Emails & Livraison » n'est consulté que
 * quand on soupçonne déjà un problème : un bug qui ne journalisait plus
 * aucun SMS après le premier est resté invisible pendant des semaines.
 * Ce contrôle quotidien regarde les dernières 24 h, canal par canal, et
 * alerte les admins dès qu'un canal échoue trop (seuils ci-dessous) — une
 * seule alerte par jour et par canal, tant que la situation persiste.
 */
import logger from "./logger.js";
import CommunicationLog from "../models/CommunicationLog.js";
import SchedulerLock, { avecVerrou } from "./schedulerLock.js";
import { notifyAdmins } from "./notifyAdmins.js";
import { nonBloquant } from "./nonBloquant.js";

export const SEUILS = { minEchecs: 3, tauxEchec: 0.2 };
const ECHECS = ["failed", "bounced"];
const LIBELLES = { email: "E-mail", sms: "SMS", whatsapp: "WhatsApp", push: "Push", internal: "Notifications internes" };

export async function analyserCanaux(depuis, jusqua = new Date()) {
  const lignes = await CommunicationLog.aggregate([
    { $match: { createdAt: { $gte: depuis, $lt: jusqua } } },
    { $group: { _id: "$channel", total: { $sum: 1 }, echecs: { $sum: { $cond: [{ $in: ["$status", ECHECS] }, 1, 0] } },
      dernier: { $max: "$errorMessage" } } },
  ]);
  return lignes.map((l) => ({ canal: l._id, total: l.total, echecs: l.echecs, taux: l.total ? l.echecs / l.total : 0, dernier: l.dernier || null }))
    .filter((l) => l.echecs >= SEUILS.minEchecs && l.taux >= SEUILS.tauxEchec);
}

export async function verifierCommunications(maintenant = new Date()) {
  try {
    const depuis = new Date(maintenant.getTime() - 24 * 3600000);
    const anomalies = await analyserCanaux(depuis, maintenant);
    let alertes = 0;
    for (const a of anomalies) {
      const cle = `communicationHealth:${a.canal}`;
      const marqueur = await SchedulerLock.findById(cle).lean();
      if (marqueur?.acquiredAt && maintenant - new Date(marqueur.acquiredAt) < 24 * 3600000) continue; // déjà alerté aujourd'hui
      await notifyAdmins("system", `⚠️ Envois ${LIBELLES[a.canal] || a.canal} en échec`,
        `${a.echecs} envoi${a.echecs > 1 ? "s" : ""} sur ${a.total} ont échoué ces 24 dernières heures (${Math.round(a.taux * 100)} %).${a.dernier ? ` Dernière erreur : ${String(a.dernier).slice(0, 140)}` : ""} Vérifiez le fournisseur dans « Emails & Livraison ».`,
        "/admin?tab=email_delivery");
      await SchedulerLock.updateOne({ _id: cle }, { $set: { acquiredAt: maintenant, holder: "communicationHealth" } }, { upsert: true });
      alertes += 1;
    }
    if (alertes) logger.warn("[CommunicationHealth] Alertes envoyées", { alertes, anomalies });
    return { alertes, anomalies };
  } catch (err) {
    logger.error("verifierCommunications:", err);
    return { alertes: 0, anomalies: [], error: err.message };
  }
}

let _interval = null;
export function startCommunicationHealthScheduler() {
  if (_interval) return;
  setTimeout(() => avecVerrou("communicationHealth", 5 * 60 * 1000, () => verifierCommunications()).catch(nonBloquant("communicationHealthCheck")), 20 * 60 * 1000);
  _interval = setInterval(() => avecVerrou("communicationHealth", 5 * 60 * 1000, () => verifierCommunications()).catch(nonBloquant("communicationHealthCheck")), 6 * 60 * 60 * 1000);
}
