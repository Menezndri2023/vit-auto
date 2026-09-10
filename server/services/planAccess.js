// ── Accès aux fonctionnalités selon l'abonnement ───────────────────────────
//
// Point de passage unique entre « quel plan ce compte a-t-il » et « a-t-il le
// droit de faire ceci ». Les contrôleurs des paliers (support prioritaire,
// équipe, API, export) posent tous la même question ; la poser à deux endroits
// différents finirait par donner deux réponses.
import Subscription from "../models/Subscription.js";
import { planOuvre, seatsDuPlan, slaHeuresDuPlan, FEATURE_MIN_PLAN } from "../constants/planFeatures.js";

// Un abonnement compte comme actif seulement s'il est payant, marqué actif ET
// non échu. Les trois conditions sont nécessaires : un plan « business » resté
// isActive après une fin de période donnerait des avantages non payés.
export function planActifDe(sub) {
  return !!(sub?.plan && sub.plan !== "free"
    && sub.planDetails?.isActive && sub.planDetails?.endDate
    && new Date(sub.planDetails.endDate) > new Date());
}

// Plan RÉELLEMENT en vigueur pour un compte, "free" si aucun ou expiré.
// Toujours une chaîne : les appelants n'ont jamais à gérer null.
export async function planEffectif(vendorId) {
  const sub = await Subscription.findOne({ vendor: vendorId }).lean();
  return planActifDe(sub) ? sub.plan : "free";
}

// Libellés des paliers, pour composer un refus qui dit ce qui manque plutôt
// qu'un « accès refusé » qui laisse le partenaire sans action possible.
const LIBELLE_PLAN = {
  individuel_plus: "Individuel+",
  business:        "Business",
  exportateur:     "Exportateur",
};

export function messageRefus(feature) {
  const min = FEATURE_MIN_PLAN[feature];
  return `Cette fonctionnalité est incluse à partir du plan ${LIBELLE_PLAN[min] || min}. Demandez son activation au support depuis la page Tarifs.`;
}

// Middleware : exige un plan actif ouvrant `feature`.
//
// Pose `req.planEffectif` pour les contrôleurs qui font ensuite varier un quota
// selon le palier (sièges d'équipe, délai de réponse) — sans quoi chacun
// relirait l'abonnement, soit une requête de plus par appel.
export function exigeFonctionnalite(feature) {
  return async (req, res, next) => {
    try {
      // Un membre d'équipe hérite du plan du titulaire : c'est le titulaire qui
      // paie, et refuser l'accès à son agent viderait l'avantage de son sens.
      const proprietaire = req.user?.teamOf || req.user?._id;
      const plan = await planEffectif(proprietaire);
      if (!planOuvre(plan, feature)) {
        return res.status(403).json({ message: messageRefus(feature), code: "PLAN_REQUIS", feature });
      }
      req.planEffectif = plan;
      req.proprietaireId = proprietaire;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export { seatsDuPlan, slaHeuresDuPlan, planOuvre };
