// ── Publication différée des annonces pré-approuvées ───────────────────────
//
// Jusqu'ici, toute annonce restait « pending » jusqu'à ce qu'un administrateur
// la voie. Résultat mesuré sur 30 jours : 83 e-mails autour du cycle de vie des
// annonces, et un partenaire qui attend sans savoir combien de temps.
//
// Une annonce complète (voir SEUIL_PREAPPROBATION) voit désormais sa
// publication PLANIFIÉE. L'administrateur garde une fenêtre pour la bloquer ;
// passé ce délai, elle paraît. Le contrôle humain existe toujours AVANT la
// mise en ligne — ce qui distingue ce mécanisme d'une publication automatique,
// et ce qui permet de tenir l'engagement pris envers Apple (règle 1.2).
//
// En mémoire, sans Redis, comme les autres planificateurs du projet
// (partnerReminders, bookingReminders, salesLeadScheduler).
import Vehicle from "../models/Vehicle.js";
import Notification from "../models/Notification.js";
import logger from "./logger.js";
import { nonBloquant } from "./nonBloquant.js";

const INTERVALLE_MS = 15 * 60 * 1000; // un quart d'heure suffit pour un délai de 6 h

/**
 * Publie les annonces dont l'heure est venue et que personne n'a bloquées.
 * Exportée pour être appelable à la main et testable sans horloge.
 */
export async function publierAnnoncesDues(maintenant = new Date()) {
  const dues = await Vehicle.find({
    status: "pending",
    publicationPlanifieeA: { $ne: null, $lte: maintenant },
    publicationBloqueeA: null,
  }).select("_id title owner").limit(200).lean();

  let publiees = 0;
  for (const v of dues) {
    // Écriture CONDITIONNELLE : entre la lecture ci-dessus et cette mise à
    // jour, un administrateur a pu bloquer l'annonce. Sans la condition, son
    // blocage serait écrasé sans bruit et l'annonce paraîtrait quand même.
    const r = await Vehicle.updateOne(
      { _id: v._id, status: "pending", publicationBloqueeA: null },
      { $set: { status: "approved", available: true, publicationPlanifieeA: null } },
    );
    if (!r.modifiedCount) continue;
    publiees++;

    Notification.create({
      user: v.owner,
      type: "vehicle_approved",
      titre: "Annonce publiée ✅",
      message: `"${v.title}" est maintenant visible dans le catalogue.`,
      lien: "/vendor-dashboard",
    }).catch(nonBloquant("publicationPlanifiee"));
  }

  if (publiees) logger.info("[publicationPlanifiee] annonces publiées", { publiees });
  return publiees;
}

export function startPublicationScheduler() {
  const tourner = () => publierAnnoncesDues().catch((err) =>
    logger.error("[publicationPlanifiee] échec du tour (non bloquant)", { error: err.message }));
  // Un premier tour au démarrage rattrape ce qui est arrivé à échéance pendant
  // que le serveur redémarrait — sinon une annonce due à 3 h du matin attend
  // le prochain quart d'heure plein après le redéploiement.
  setTimeout(tourner, 30 * 1000);
  const timer = setInterval(tourner, INTERVALLE_MS);
  timer.unref?.();
  logger.info("[publicationPlanifiee] planificateur démarré", { intervalleMin: INTERVALLE_MS / 60000 });
  return timer;
}
