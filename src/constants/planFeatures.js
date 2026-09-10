// Miroir d'affichage de server/constants/planFeatures.js (pas de dossier
// partagé entre server/ et src/ dans ce dépôt — même convention que
// src/constants/subscriptionPlans.js).
//
// Sert UNIQUEMENT à annoncer et à composer l'interface. Il n'autorise rien :
// chaque route serveur revérifie le palier de son côté. Une divergence ici ne
// peut donc produire qu'un affichage inexact, jamais un accès indu.
export const PLAN_SEATS = {
  free:            1,
  individuel_plus: 1,
  business:        3,
  exportateur:     10,
};

export const PLAN_SUPPORT_SLA_HOURS = {
  free:            72,
  individuel_plus: 48,
  business:        24,
  exportateur:     4,
};

export const API_RATE_LIMIT_PER_HOUR = 300;

// Libellés des refus renvoyés par le serveur (code "PLAN_REQUIS") — l'interface
// affiche le message du serveur tel quel, cette table sert à choisir le bon
// appel à l'action.
export const FEATURE_MIN_PLAN = {
  statistiques:         "individuel_plus",
  exportStatistiques:   "business",
  assistancePremium:    "business",
  multiUtilisateurs:    "business",
  accesApi:             "exportateur",
  demandesPrioritaires: "business",
  carrouselReserve:     "exportateur",
  rapportMensuel:       "business",
};

// Avance, en heures, sur les demandes clients fraîchement déposées.
// Miroir de partnerRequestsController.AVANCE_ABONNE_MS.
export const AVANCE_DEMANDES_HEURES = 2;

// Places de la vitrine d'accueil réservées à chaque palier, en rotation
// quotidienne. Miroir de services/carrouselReserve.PLACES_PAR_PLAN.
//
// La vitrine ne montre QUE des annonces de la collection Vehicle — location,
// vente, essai, leasing. Les annonces Import/Export n'y transitent jamais.
export const PLACES_VITRINE_PAR_PLAN = {
  individuel_plus: 1,
  business:        2,
  exportateur:     3,
};

// Durée de l'essai gratuit ouvert par le support.
export const DUREE_ESSAI_JOURS = 30;

export const LIBELLE_PLAN = {
  free:            "Gratuit",
  individuel_plus: "Individuel Plus",
  business:        "Business",
  exportateur:     "Exportateur",
};
