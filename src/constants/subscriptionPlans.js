// Mises en avant incluses chaque mois dans l'abonnement — dupliqué à
// l'identique dans server/constants/subscriptionPlans.js (pas de dossier
// partagé entre server/ et src/ dans ce dépôt, même convention que
// src/constants/partnerTaxonomy.js).
//
// Sert à ANNONCER l'avantage sur la page Tarifs. Le décompte réel, lui, est
// calculé côté serveur et renvoyé par GET /api/subscriptions/me : l'interface
// ne recompte jamais un quota, elle affiche celui que le serveur lui donne.
export const PLAN_INCLUDED_BOOSTS = {
  free:            0,
  individuel_plus: 2,
  business:        6,
  exportateur:     6,
};

export const INCLUDED_BOOST_TIER = "7d";

// Badge « partenaire abonné » affiché sur une annonce.
//
// Volontairement DÉRIVÉ de `ownerPlanRank`/`ownerPlanUntil`, déjà portés par
// chaque annonce, plutôt qu'écrit dans `User.certificationBadge` : ce champ
// porte déjà « vérifié » et « fondateur », gagnés par un dossier de
// certification et par la signature d'un accord. Y écrire l'abonnement
// écraserait une distinction méritée par une distinction achetée — et la
// restaurer à l'expiration du plan supposerait de savoir ce qu'elle valait
// avant.
//
// Les deux badges coexistent donc, et c'est juste : ils ne disent pas la même
// chose. L'un atteste d'une vérification, l'autre d'un engagement commercial.
//
// La date d'expiration est comparée à l'instant de l'affichage, exactement
// comme le fait le tri du catalogue : un abonnement échu cesse de valoir badge
// sans qu'aucune tâche n'ait à l'éteindre.
export function estPartenaireAbonne(annonce) {
  if (!annonce?.ownerPlanUntil) return false;
  if (!(Number(annonce.ownerPlanRank) > 0)) return false;
  return new Date(annonce.ownerPlanUntil) > new Date();
}

// Libellé volontairement NEUTRE quant au palier : le client n'a pas à savoir
// combien son loueur paie d'abonnement, et un « Exportateur » affiché sur une
// annonce de location ne lui apprendrait rien.
export const LIBELLE_BADGE_ABONNE = "Pro";

// Ce que le badge affirme, et rien de plus : un engagement commercial, jamais
// une promesse de qualité que la plateforme ne peut pas tenir.
export const INFOBULLE_BADGE_ABONNE =
  "Partenaire engagé dans une formule professionnelle VIT AUTO";
