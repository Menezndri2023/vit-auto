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

// ⚠️ Une entrée ici est une PROMESSE VENDUE : src/constants/planFeatures.js
// l'annonce sur la page Tarifs, et planFeatures.coherence.test.js refuse tout
// outil annoncé qui n'aurait pas sa ligne ici, au même palier. Une entrée que
// personne ne vérifie est pire qu'absente — elle se vend sans rien donner.
//
// Retirée le 2026-09-26, parce que DÉCLARÉE et jamais appliquée :
//  · `carrouselReserve` — place réservée au carrousel d'accueil. Le moteur de
//    mise en avant lit le mérite et les boosts achetés, jamais le plan. Tant
//    que ce n'est pas construit, ne pas le vendre.
export const FEATURE_MIN_PLAN = {
  // Tableau d'analyse : vues, taux de conversion, prix face à la médiane de la
  // ville, recommandations. Verrouillé dans getPartnerInsights.
  statistiques:      "individuel_plus",
  exportStatistiques:"business",        // téléchargement CSV
  assistancePremium: "business",        // file prioritaire + délai garanti
  multiUtilisateurs: "business",        // comptes d'équipe rattachés
  accesApi:          "exportateur",     // clés d'API lecture seule
  // Avance sur les demandes clients fraîchement déposées. Ce n'est pas une
  // exclusivité : les non-abonnés les voient après un délai (voir
  // partnerRequestsController.AVANCE_ABONNE_MS).
  demandesPrioritaires: "business",
  // Rapport mensuel de performance envoyé par e-mail.
  rapportMensuel:    "business",

  // ── Outils par secteur (2026-09-14) ──────────────────────────────────────
  // Vendus par palier sur la page Tarifs (src/constants/planFeatures.
  // OUTILS_PAR_SECTEUR) ; verrouillés ici par `exigeOutil`, qui applique la
  // même immunité de lancement et la même exemption fondateur que les quotas
  // d'annonces — un outil déjà utilisé par un partenaire gratuit ne lui est
  // pas retiré du jour au lendemain, la règle prend effet à la date prévue.
  tarifsSaisonniers: "individuel_plus", // loueur
  promotions:        "individuel_plus", // loueur, vendeur
  journalVehicule:   "business",        // gestion de parc : entretien, incidents
  importFlotte:      "business",        // import CSV / Excel / Google Sheets
  showroom:          "business",        // page showroom publique personnalisée
  crmLeadsDevis:     "business",        // leads et devis du PMS
  // Lien court /p/<nom> + QR code de la vitrine partageable. La PAGE
  // /partner/<id> reste publique à tous les paliers (décision de l'exploitant,
  // 2026-09-25) : ce qui s'achète, c'est une adresse imprimable.
  lienCourtVitrine:  "individuel_plus",
  // Plusieurs prix pour un même véhicule d'export, un par Incoterm (FOB, CIF,
  // CFR…). Le partenaire les saisit depuis son tableau de bord importateur ;
  // l'acheteur voit le devis correspondant à l'Incoterm qu'il choisit. Le
  // palier gratuit garde UN prix et UN Incoterm — ce qui suffit pour vendre.
  incotermsMultiples: "individuel_plus", // exportateur
  // Seuil sous lequel le partenaire est prévenu qu'une pièce va manquer.
  // Premier outil du secteur « pièces », ouvert le 2026-09-14 et resté sans
  // rien à vendre jusqu'ici. Une pièce commandée mais indisponible, c'est une
  // commande annulée : sur un catalogue de plusieurs centaines de références,
  // personne ne surveille les compteurs à la main.
  alerteStockBas:     "individuel_plus", // pièces
  // Import d'un catalogue de pièces par fichier — jumeau d'`importFlotte`,
  // vendu séparément : un vendeur de pièces n'achète pas l'import de flotte.
  importCatalogue:    "business",        // pièces
  // Un forfait de livraison PAR ZONE de pays, au lieu d'un forfait unique
  // pour tout le corridor. Sans lui, livrer dans sa propre ville coûte au
  // client le même prix qu'à l'autre bout de l'Afrique de l'Ouest : le
  // partenaire perd les commandes proches et perd de l'argent sur les
  // lointaines.
  fraisPortParZone:   "business",        // pièces
  // État des lieux photo au départ et au retour d'une location. La caution
  // est le premier motif de friction du secteur : sans preuve horodatée, une
  // retenue se discute parole contre parole et l'administration arbitre à
  // l'aveugle.
  etatDesLieux:       "business",        // loueur
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

// ── Secteurs cumulables ────────────────────────────────────────────────────
// Un secteur (location, vente, export, chauffeur, loisirs) est une IDENTITÉ
// validée par l'administration, jamais un droit qu'un plan ouvre. Ce que le
// plan fixe, c'est COMBIEN de secteurs un même compte peut cumuler : l'agence
// qui loue ET vend relève de Business, le groupe qui loue, vend et exporte du
// palier supérieur. `null` = sans limite.
export const PLAN_SECTEURS = {
  free:            1,
  individuel_plus: 1,
  business:        2,
  exportateur:     null,
};

// ── Quota d'annonces ACTIVES par secteur ───────────────────────────────────
// Compte les annonces en attente ou approuvées (brouillons, archivées,
// vendues, rejetées exclues). Le quota ne dépublie jamais l'existant : il
// bloque uniquement la publication AU-DELÀ, à la création. `null` = illimité.
export const PLAN_QUOTA_ANNONCES = {
  free:            5,
  individuel_plus: 15,
  business:        60,
  exportateur:     null,
};

// Immunité de lancement : jusqu'à cette date, tout partenaire publie sans
// quota, quel que soit son plan — même geste et même durée que l'offre
// Partenaire Fondateur et que la vitrine partenaires gratuite
// (spotlightEngine.FIN_VITRINE_PARTENAIRES_GRATUITE). Comparée à l'instant de
// la requête : la règle reprend d'elle-même, sans redéploiement. Au-delà, les
// Partenaires Fondateurs restent exemptés pendant leurs douze mois.
export const FIN_IMMUNITE_QUOTAS = new Date("2027-09-10T00:00:00Z");

export const secteursDuPlan      = (plan) => (plan in PLAN_SECTEURS ? PLAN_SECTEURS[plan] : PLAN_SECTEURS.free);
export const quotaAnnoncesDuPlan = (plan) => (plan in PLAN_QUOTA_ANNONCES ? PLAN_QUOTA_ANNONCES[plan] : PLAN_QUOTA_ANNONCES.free);

export const seatsDuPlan     = (plan) => PLAN_SEATS[plan] ?? 1;
export const slaHeuresDuPlan = (plan) => PLAN_SUPPORT_SLA_HOURS[plan] ?? PLAN_SUPPORT_SLA_HOURS.free;
