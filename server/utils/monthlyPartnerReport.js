/**
 * VIT AUTO — Rapport mensuel de performance (palier Business et au-delà)
 *
 * Un abonnement se renouvelle quand on se souvient de ce qu'il apporte. Un
 * partenaire qui n'ouvre pas son tableau de bord ne voit jamais ses chiffres,
 * et son abonnement devient une ligne de dépense sans contrepartie visible.
 * Ce rapport porte les chiffres jusqu'à lui, au moment du mois où la question
 * du renouvellement se pose.
 *
 * Pas de nouveau gabarit d'e-mail : toute Notification déclenche déjà un envoi
 * générique (voir le hook post("save") de models/Notification.js). Ajouter un
 * gabarit dédié aurait dupliqué un mécanisme qui fonctionne.
 *
 * Volontairement PAS un job BullMQ, même raison que utils/partnerReminders.js :
 * le quota Redis est déjà sous tension, et un scan quotidien en mémoire suffit.
 */
import logger from "./logger.js";
import { avecVerrou } from "./schedulerLock.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { invokeController } from "./invokeController.js";
import { getPartnerInsights } from "../controllers/subscriptionController.js";
import { planOuvre } from "../constants/planFeatures.js";
import { planActifDe } from "../services/planAccess.js";
import { nonBloquant } from "./nonBloquant.js";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
              "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Un rapport est dû si aucun n'a été envoyé depuis le début du mois courant.
// Formulé ainsi plutôt qu'en « on est le 1ᵉʳ » : si le serveur est arrêté ce
// jour-là, le rapport part au redémarrage au lieu d'être sauté pour un mois.
export function rapportDu(lastSentAt, maintenant = new Date()) {
  if (!lastSentAt) return true;
  const debutDuMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  return new Date(lastSentAt) < debutDuMois;
}

export function composerMessage(resume, moisPrecedent) {
  if (!resume || !resume.annonces) {
    return `Aucune annonce publiée en ${moisPrecedent}. Publiez une annonce pour commencer à mesurer vos performances.`;
  }
  const parties = [
    `${resume.vuesTotales} vue${resume.vuesTotales > 1 ? "s" : ""}`,
    `${resume.reservations} réservation${resume.reservations > 1 ? "s" : ""}`,
    `${resume.favoris} mise${resume.favoris > 1 ? "s" : ""} en favori`,
  ];
  let message = `Vos ${resume.annonces} annonces sur ${moisPrecedent} : ${parties.join(", ")}.`;
  if (resume.meilleure?.titre) {
    message += ` Votre meilleure annonce est « ${resume.meilleure.titre} ».`;
  }
  // On ne signale un point à corriger que s'il y en a réellement un : un
  // rapport qui accuse tous les mois finit par n'être plus ouvert.
  if (resume.aCorriger > 0) {
    message += ` ${resume.aCorriger} annonce${resume.aCorriger > 1 ? "s méritent" : " mérite"} une correction (photo, description ou prix).`;
  }
  if (resume.jamaisVues > 0) {
    message += ` ${resume.jamaisVues} annonce${resume.jamaisVues > 1 ? "s n'ont" : " n'a"} reçu aucune vue.`;
  }
  return message;
}

export async function envoyerRapportsMensuels(maintenant = new Date()) {
  let envoyes = 0;
  try {
    const abonnements = await Subscription.find({
      plan: { $ne: "free" },
      "planDetails.isActive": true,
      "planDetails.endDate": { $gt: maintenant },
    }).limit(1000);

    const moisPrecedent = MOIS[(maintenant.getMonth() + 11) % 12];

    for (const sub of abonnements) {
      // Revérifié un par un : la requête ci-dessus ne dit pas quel PALIER, et
      // le rapport commence à Business.
      if (!planActifDe(sub) || !planOuvre(sub.plan, "rapportMensuel")) continue;
      if (!rapportDu(sub.lastMonthlyReportAt, maintenant)) continue;

      const vendeur = await User.findById(sub.vendor).select("firstName isActive").lean();
      if (!vendeur?.isActive) continue;

      // Réutilise le calcul du tableau de bord — un second calcul finirait par
      // donner des chiffres différents de ceux que le partenaire voit à l'écran.
      const { statusCode, body } = await invokeController(getPartnerInsights, {
        user: { _id: sub.vendor, role: "partenaire" },
      });
      if (statusCode !== 200) continue;

      await Notification.create({
        user: sub.vendor,
        type: "system",
        titre: `📈 Votre bilan de ${moisPrecedent}`,
        message: composerMessage(body.resume, moisPrecedent),
        lien: "/vendor/pro",
      });

      // Marqué APRÈS l'envoi : en cas d'échec, le rapport sera retenté au
      // prochain passage plutôt que perdu pour le mois.
      sub.lastMonthlyReportAt = maintenant;
      await sub.save();
      envoyes += 1;
    }
  } catch (err) {
    logger.error("envoyerRapportsMensuels (non bloquant) :", err.message);
  }
  if (envoyes) logger.info(`Rapports mensuels partenaires envoyés : ${envoyes}`);
  return envoyes;
}

// Chaque cycle passe par le verrou partagé entre instances (voir
// utils/schedulerLock.js) : jamais deux exécutions simultanées du même cycle.
let _interval = null;
export function startMonthlyReportScheduler() {
  if (_interval) return;
  setTimeout(() => avecVerrou("monthlyPartnerReport", 60 * 60 * 1000, () => envoyerRapportsMensuels()).catch(nonBloquant("monthlyPartnerReport")), 10 * 60 * 1000); // 10 min après le démarrage
  _interval = setInterval(() => avecVerrou("monthlyPartnerReport", 60 * 60 * 1000, () => envoyerRapportsMensuels()).catch(nonBloquant("monthlyPartnerReport")), 24 * 60 * 60 * 1000);
  _interval.unref?.();
}
