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
//
// ⚠️ CHAQUE entrée porte le nom de sa garde serveur (`feature`), et
// planFeatures.coherence.test.js refuse tout outil dont la garde n'existe pas
// dans server/constants/planFeatures.js AU MÊME PALIER.
//
// Pourquoi ce champ existe (audit du 2026-09-26) : la table annonçait
// 25 outils, le serveur n'en verrouillait que 8. Neuf d'entre eux étaient
// invendables pour une raison ou une autre —
//  · déjà GRATUITS pour tous : planning et indisponibilités du chauffeur
//    (Driver.blackoutDates), créneaux et capacité d'une séance
//    (Activity.capacity), report météo (Activity.weatherDependent) ;
//  · INEXISTANTS : « prix face au marché », « tarifs de groupe » ;
//  · réservés à l'ADMINISTRATION : dossier de financement ;
//  · confondus avec le SERVICE lui-même : suivi de dossier import/export,
//    documents LOI — ils viennent de l'accompagnement, pas d'un abonnement ;
//  · dépendant d'un autre mécanisme : « mise en avant dans la rubrique »,
//    que le moteur attribue au mérite et aux boosts, jamais au plan.
//
// Ils ont été retirés plutôt que déplacés : un partenaire qui souscrit pour
// une fonction qu'il avait déjà ne s'en aperçoit qu'une fois, et ne renouvelle
// pas. Les secteurs sans outil propre à un palier n'ont PAS de case vide : ils
// reçoivent les avantages transversaux (lien court, sièges, export tableur,
// demandes en avance, API), qui sont réels et verrouillés.
export const OUTILS_PAR_SECTEUR = {
  loueur: {
    individuel_plus: [
      { key: "outil.seasonalRates", feature: "tarifsSaisonniers" },
      { key: "outil.promotions",    feature: "promotions" },
    ],
    business: [
      { key: "outil.fleetImport", feature: "importFlotte" },
      { key: "outil.fleetMgmt",   feature: "journalVehicule" },
    ],
    exportateur: [
      { key: "outil.fleetApi", feature: "accesApi" },
    ],
  },
  vendeur: {
    individuel_plus: [
      { key: "outil.promotions", feature: "promotions" },
    ],
    business: [
      { key: "outil.crmSales",    feature: "crmLeadsDevis" },
      { key: "outil.showroom",    feature: "showroom" },
      { key: "outil.salesReport", feature: "rapportMensuel" },
    ],
    exportateur: [
      { key: "outil.stockApi", feature: "accesApi" },
    ],
  },
  exportateur: {
    individuel_plus: [
      { key: "outil.incoterms", feature: "incotermsMultiples" },
    ],
    business: [
      { key: "outil.crmExport",    feature: "crmLeadsDevis" },
      { key: "outil.earlyIeLeads", feature: "demandesPrioritaires" },
    ],
    exportateur: [
      { key: "outil.resellerApi", feature: "accesApi" },
    ],
  },
  chauffeur: {
    // Le planning et les indisponibilités restent GRATUITS : ils existaient
    // déjà pour tous, et les vendre en Essentiel revenait à facturer l'air.
    individuel_plus: [],
    business: [
      { key: "outil.driverCompany", feature: "multiUtilisateurs" },
    ],
    exportateur: [],
  },
  // Secteur créé le 2026-09-14 : aucun outil propre à ce jour. Les avantages
  // transversaux s'appliquent.
  pieces: { individuel_plus: [], business: [], exportateur: [] },
  loisirs: {
    // Créneaux, capacité et report météo restent GRATUITS — ils sont dans le
    // modèle Activity et fonctionnent pour tout le monde.
    individuel_plus: [],
    business: [
      { key: "outil.instructorTeam", feature: "multiUtilisateurs" },
    ],
    exportateur: [],
  },
};

// ── Ce que le palier GRATUIT donne déjà ────────────────────────────────────
// Annoncé explicitement sur la page Tarifs : un socle qu'on cache donne
// l'impression que tout est payant, et pousse à souscrire pour rien.
export const SOCLE_GRATUIT = [
  { key: "socle.vitrine" },
  { key: "socle.contrat" },
  { key: "socle.messagerie" },
  { key: "socle.revenus" },
];

// Outils gratuits PROPRES à un métier — affichés dans l'onglet du secteur,
// pour que le partenaire voie ce qu'il a avant ce qu'il peut acheter.
export const GRATUIT_PAR_SECTEUR = {
  loueur:      [{ key: "socle.planning" }],
  vendeur:     [],
  exportateur: [{ key: "socle.unIncoterm" }],
  chauffeur:   [{ key: "socle.planning" }, { key: "socle.zonesDesservies" }],
  loisirs:     [{ key: "socle.creneaux" }, { key: "socle.meteo" }],
  pieces:      [{ key: "socle.stock" }],
};

