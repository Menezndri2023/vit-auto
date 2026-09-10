// ── Ce que chaque palier d'abonnement ouvre réellement ─────────────────────
//
// UNE seule matrice, côté serveur, qui fait autorité. La page Tarifs en tient
// un miroir (src/constants/planFeatures.js) pour ANNONCER les avantages ; elle
// n'autorise rien — chaque route revérifie ici.
//
// Le rang du plan sert de seuil : une fonctionnalité ouverte à `business` l'est
// aussi à `exportateur`, sans avoir à réénumérer les paliers supérieurs à
// chaque ligne (l'oubli d'un palier dans une liste est le bug classique de ce
// genre de table).
import { PLAN_RANK, planRank } from "./subscriptionPlans.js";

export const FEATURE_MIN_PLAN = {
  statistiques:      "individuel_plus", // tableau de bord de performance
  exportStatistiques:"business",        // téléchargement CSV
  assistancePremium: "business",        // file prioritaire + délai garanti
  multiUtilisateurs: "business",        // comptes d'équipe rattachés
  accesApi:          "exportateur",     // clés d'API lecture seule
  // Avance sur les demandes clients fraîchement déposées. Ce n'est pas une
  // exclusivité : les non-abonnés les voient après un délai (voir
  // partnerRequestsController.AVANCE_ABONNE_MS).
  demandesPrioritaires: "business",
  // Place réservée dans le carrousel d'accueil, distincte des mises en avant
  // achetées à l'unité.
  carrouselReserve:  "exportateur",
  // Rapport mensuel de performance envoyé par e-mail.
  rapportMensuel:    "business",
};

// Sièges d'équipe INCLUS, titulaire compris. `business` en ouvre trois : un
// gérant et deux agents, la taille réelle d'une agence de location. Le palier
// gratuit vaut 1 — c'est-à-dire le titulaire seul, donc aucune équipe.
export const PLAN_SEATS = {
  free:            1,
  individuel_plus: 1,
  business:        3,
  exportateur:     10,
};

// Délai de PREMIÈRE réponse annoncé au partenaire, en heures. Ce n'est pas un
// délai de résolution : promettre une résolution dépend du problème, promettre
// une première réponse ne dépend que de l'organisation du support.
export const PLAN_SUPPORT_SLA_HOURS = {
  free:            72,
  individuel_plus: 48,
  business:        24,
  exportateur:     4,
};

// Quota d'appels d'API par heure et par clé. Volontairement bas : l'API sert à
// synchroniser une flotte, pas à balayer le catalogue. Un partenaire qui a
// besoin de davantage passe par le support, ce qui donne l'occasion de
// comprendre son usage.
export const API_RATE_LIMIT_PER_HOUR = 300;

// `plan` peut valoir null/undefined (aucun abonnement) — traité comme "free".
export const planOuvre = (plan, feature) => {
  const min = FEATURE_MIN_PLAN[feature];
  if (!min) return false; // fonctionnalité inconnue : refus, jamais ouverture
  return planRank(plan) >= PLAN_RANK[min];
};

export const seatsDuPlan     = (plan) => PLAN_SEATS[plan] ?? 1;
export const slaHeuresDuPlan = (plan) => PLAN_SUPPORT_SLA_HOURS[plan] ?? PLAN_SUPPORT_SLA_HOURS.free;
