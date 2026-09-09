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
