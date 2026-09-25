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
  // Outils par secteur — verrouillés côté serveur par `exigeOutil`, avec la
  // même immunité de lancement et la même exemption fondateur que les quotas.
  tarifsSaisonniers:    "individuel_plus",
  promotions:           "individuel_plus",
  journalVehicule:      "business",
  importFlotte:         "business",
  showroom:             "business",
  crmLeadsDevis:        "business",
  lienCourtVitrine:     "individuel_plus",
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

// Noms COMMERCIAUX des paliers. Les identifiants (individuel_plus,
// exportateur…) sont figés en base et dans les routes ; seuls les libellés
// changent. « Exportateur » désignait à la fois un palier et un secteur
// d'activité — un loueur professionnel ne savait pas s'il devait prendre
// Business ou Exportateur. Les paliers portent désormais des noms qui ne sont
// ni un métier ni un type d'entité : ils vendent des outils et de la
// visibilité, pas une identité.
export const LIBELLE_PLAN = {
  free:            "Gratuit",
  individuel_plus: "Essentiel",
  business:        "Business",
  exportateur:     "Premium",
  entreprise:      "Entreprise",
};

// ── Secteurs cumulables et quota d'annonces — miroir de server/constants/planFeatures.js
// `null` = sans limite.
export const PLAN_SECTEURS = {
  free:            1,
  individuel_plus: 1,
  business:        2,
  exportateur:     null,
};

export const PLAN_QUOTA_ANNONCES = {
  free:            5,
  individuel_plus: 15,
  business:        60,
  exportateur:     null,
};

// Jusqu'à cette date, aucun quota ne s'applique (immunité de lancement) ; les
// Partenaires Fondateurs restent exemptés pendant leurs douze mois au-delà.
export const FIN_IMMUNITE_QUOTAS = new Date("2027-09-10T00:00:00Z");

// ── Outils par secteur, par palier ─────────────────────────────────────────
// Même prix et même palier pour tous les métiers ; ce qui change, c'est le
// contenu montré à chaque partenaire. UNIQUEMENT ce qui existe : la page
// Tarifs ne vend pas de « bientôt » (un test le verrouille) — les outils à
// construire sont listés dans docs/manuels/acces-partenaires.md, pas ici.
export const OUTILS_PAR_SECTEUR = {
  loueur: {
    individuel_plus: [
      { text: "Tarifs saisonniers et promotions multi-paliers" },
    ],
    business: [
      { text: "Import de flotte par fichier (CSV, Excel, Google Sheets)" },
      { text: "Gestion de parc : planning, entretien, journal de chaque véhicule" },
    ],
    exportateur: [
      { text: "Synchronisation du parc par API depuis votre logiciel" },
    ],
  },
  vendeur: {
    individuel_plus: [
      { text: "Prix face au marché sur chaque annonce" },
    ],
    business: [
      { text: "CRM intégré : demandes d'essai, leads et devis" },
      { text: "Showroom public personnalisé" },
      { text: "Bilan mensuel des ventes et des essais par e-mail" },
    ],
    exportateur: [
      { text: "Synchronisation du stock par API" },
      { text: "Dossier financement et crédit intégré à la vente" },
    ],
  },
  exportateur: {
    individuel_plus: [
      { text: "Calculateur Incoterms 2020 sur chaque annonce" },
    ],
    business: [
      { text: "Suivi de dossier complet : inspection, séquestre, transport" },
      { text: "Demandes import/export des visiteurs reçues en avance" },
      { text: "Documents LOI et accord partenaire" },
    ],
    exportateur: [
      { text: "CRM export multi-devises" },
      { text: "API catalogue pour vos revendeurs" },
      { text: "Estimation du coût d'import affichée au client" },
    ],
  },
  chauffeur: {
    individuel_plus: [
      { text: "Profil mis en avant dans la rubrique Chauffeurs" },
      { text: "Planning et indisponibilités" },
    ],
    business: [
      { text: "Société de chauffeurs : plusieurs chauffeurs sous un même compte" },
    ],
    exportateur: [],
  },
  // Secteur créé le 2026-09-14 : aucun outil spécifique construit à ce jour.
  pieces: { individuel_plus: [], business: [], exportateur: [] },
  loisirs: {
    individuel_plus: [
      { text: "Mise en avant dans la rubrique Loisirs" },
      { text: "Créneaux et capacité par séance" },
    ],
    business: [
      { text: "Fermeture automatique selon la météo" },
      { text: "Tarifs de groupe et de saison" },
      { text: "Équipe de moniteurs sous un même compte" },
    ],
    exportateur: [
    ],
  },
};
