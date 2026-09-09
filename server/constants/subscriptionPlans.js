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

// ── Mises en avant INCLUSES chaque mois dans l'abonnement ──────────────────
// Un abonnement qui se contente de réduire une commission ne se vend qu'aux
// partenaires à fort volume — ceux qu'une plateforme jeune n'a pas encore.
// Des mises en avant incluses donnent au partenaire quelque chose qu'il VOIT :
// ses annonces remontent dès le premier mois, sans geste supplémentaire.
//
// Le palier « 7d » est retenu : assez long pour produire un effet mesurable,
// assez court pour que le quota se renouvelle utilement chaque mois.
export const PLAN_INCLUDED_BOOSTS = {
  free:            0,
  individuel_plus: 2,
  business:        6,
  exportateur:     6,
};

export const INCLUDED_BOOST_TIER = "7d";

export const includedBoosts = (plan) => PLAN_INCLUDED_BOOSTS[plan] ?? 0;

// Marque un boost offert par l'abonnement, pour le distinguer d'un boost acheté
// à l'unité : c'est ce qui permet de compter le quota consommé du mois sans
// confondre les deux (un boost payé ne doit jamais décompter le quota).
export const INCLUDED_BOOST_MARK = "plan_inclus";
