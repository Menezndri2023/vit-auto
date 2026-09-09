// Poids de classement des plans d'abonnement partenaire.
//
// « Classement prioritaire » est vendu sur la page Tarifs depuis l'origine,
// mais le catalogue ne triait que sur les mises en avant ACHETÉES
// (sponsoredUntil/boostLevel) : un partenaire abonné payait pour une visibilité
// qu'il n'obtenait jamais. Ce barème donne enfin un effet à l'abonnement.
//
// Volontairement SOUS le boost : une mise en avant achetée à l'unité reste
// devant, sinon l'abonnement dévaloriserait le produit le plus cher.
export const PLAN_RANK = {
  free:            0,
  individuel_plus: 1,
  business:        2,
  exportateur:     3,
};

export const planRank = (plan) => PLAN_RANK[plan] ?? 0;
