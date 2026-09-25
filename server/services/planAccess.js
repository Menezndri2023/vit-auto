// ── Accès aux fonctionnalités selon l'abonnement ───────────────────────────
//
// Point de passage unique entre « quel plan ce compte a-t-il » et « a-t-il le
// droit de faire ceci ». Les contrôleurs des paliers (support prioritaire,
// équipe, API, export) posent tous la même question ; la poser à deux endroits
// différents finirait par donner deux réponses.
import Subscription from "../models/Subscription.js";
import { planOuvre, seatsDuPlan, slaHeuresDuPlan, FEATURE_MIN_PLAN, FIN_IMMUNITE_QUOTAS } from "../constants/planFeatures.js";
import { fondateurActif } from "./fondateur.js";

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
// Noms commerciaux — miroir de src/constants/planFeatures.LIBELLE_PLAN. Les
// identifiants restent figés ; « Exportateur » ne nomme plus un palier, il
// nommait déjà un secteur d'activité.
const LIBELLE_PLAN = {
  individuel_plus: "Essentiel",
  business:        "Business",
  exportateur:     "Premium",
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

// Middleware : exige un plan ouvrant l'OUTIL `feature`, avec trois passes-
// droits que `exigeFonctionnalite` n'a pas — parce qu'un outil se distingue
// d'un avantage : (1) un administrateur agit sur les annonces de n'importe
// quel partenaire, il n'a pas d'abonnement ; (2) jusqu'à FIN_IMMUNITE_QUOTAS,
// tout partenaire garde ses outils, comme il garde ses annonces sans quota ;
// (3) un Partenaire Fondateur en cours a tout, c'est l'offre signée.
// Sans ces trois cas, activer la règle retirerait aujourd'hui l'import de
// flotte ou le showroom à des comptes qui s'en servent.
// `maintenant` est injectable pour les tests : la règle dépend d'une date.
export function exigeOutil(feature, { maintenant = () => new Date() } = {}) {
  return async (req, res, next) => {
    try {
      const verdict = await outilOuvert(req.user, feature, { maintenant });
      if (!verdict.ouvert) {
        return res.status(403).json({ message: messageRefus(feature), code: "PLAN_REQUIS", feature });
      }
      req.proprietaireId = verdict.proprietaireId;
      if (verdict.plan) req.planEffectif = verdict.plan;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Même règle que `exigeOutil`, en PRÉDICAT — pour les endpoints qui ne
// refusent pas l'appel mais composent une réponse partielle.
//
// Le cas qui l'a rendu nécessaire : la vitrine partenaire rend TOUJOURS
// l'adresse publique (décision de l'exploitant : la page reste ouverte à
// tous), et n'ajoute le lien court et le QR code que si le palier les ouvre.
// Un middleware ne sait faire que « passe » ou « 403 » ; réécrire les trois
// passe-droits dans le contrôleur aurait donné une seconde vérité sur qui a
// droit à quoi, et c'est exactement ainsi qu'on finit avec deux réponses
// différentes à la même question.
//
// `raison` sert à l'interface : « inclus à partir d'Essentiel » ne se dit pas
// de la même façon qu'un accès déjà acquis.
export async function outilOuvert(user, feature, { maintenant = () => new Date() } = {}) {
  if (user?.role === "admin") return { ouvert: true, raison: "admin", proprietaireId: user?._id };
  const proprietaireId = user?.teamOf || user?._id;
  const now = maintenant();
  if (now < FIN_IMMUNITE_QUOTAS) return { ouvert: true, raison: "immunite", proprietaireId };
  if (await fondateurActif(proprietaireId, now)) return { ouvert: true, raison: "fondateur", proprietaireId };
  const plan = await planEffectif(proprietaireId);
  return planOuvre(plan, feature)
    ? { ouvert: true, raison: "plan", plan, proprietaireId }
    : { ouvert: false, raison: "plan_insuffisant", plan, planRequis: FEATURE_MIN_PLAN[feature], proprietaireId };
}

export { seatsDuPlan, slaHeuresDuPlan, planOuvre };
