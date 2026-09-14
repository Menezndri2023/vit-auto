// Taxonomie des activités culturelles/loisir (section "OTHERS" du catalogue) —
// dupliqué à l'identique dans src/constants/activityTypes.js (pas de dossier
// partagé entre server/ et src/ dans ce repo — voir server/constants/incoterms.js
// et server/constants/partnerTaxonomy.js pour le même principe).
export const ACTIVITY_TYPES = [
  "QUAD",
  "SURF",
  "MONTGOLFIERE",
  "JETSKI",
  "JET_PRIVE",
  "BATEAU",
  "KARTING",
  "PAINTBALL",
  "PLONGEE",
  "PARACHUTE",
  "PARAPENTE",
  "CROISIERE",
  "AUTRE",
];

export const ACTIVITY_TYPE_LABELS = {
  QUAD:          "Quad",
  SURF:          "Surf",
  MONTGOLFIERE:  "Montgolfière",
  JETSKI:        "Jetski",
  JET_PRIVE:     "Jet privé",
  BATEAU:        "Bateau",
  KARTING:       "Karting",
  PAINTBALL:     "Paintball",
  PLONGEE:       "Plongée",
  PARACHUTE:     "Parachute",
  PARAPENTE:     "Parapente",
  CROISIERE:     "Croisière / Yacht",
  AUTRE:         "Autre activité",
};

export const ACTIVITY_TYPE_ICONS = {
  QUAD:          "🏍️",
  SURF:          "🏄",
  MONTGOLFIERE:  "🎈",
  JETSKI:        "🚤",
  JET_PRIVE:     "🛩️",
  BATEAU:        "⛵",
  KARTING:       "🏎️",
  PAINTBALL:     "🔫",
  PLONGEE:       "🤿",
  PARACHUTE:     "🪂",
  PARAPENTE:     "🪂",
  CROISIERE:     "🛥️",
  AUTRE:         "🎟️",
};

// "per_person" = prix multiplié par le nombre de participants ; "per_session"
// = prix forfaitaire pour la sortie entière (typiquement Jet privé/Bateau/
// Montgolfière privatisés), quel que soit le nombre de participants dans la
// limite de la capacité de l'annonce.
export const ACTIVITY_PRICE_UNITS = ["per_person", "per_session"];

// ── Activités soumises aux conditions météo ──────────────────────────────
// Demande de NEMO Diving (2026-09-14) : une plongée n'a lieu que si la météo
// est propice. La règle vaut pour toute sortie en mer ou dans les airs — le
// partenaire peut l'activer ou la désactiver annonce par annonce
// (Activity.weatherDependent) ; à défaut, c'est le type qui décide.
export const WEATHER_DEPENDENT_TYPES = ["PLONGEE", "SURF", "JETSKI", "BATEAU", "CROISIERE", "MONTGOLFIERE", "PARACHUTE", "PARAPENTE"];
export const WEATHER_CONDITION_TEXT = "Cette sortie n'a lieu que si la météo est propice. En cas de conditions défavorables (mer, vent, visibilité), le partenaire vous propose un autre créneau ou le remboursement intégral, sans frais.";
export const isWeatherDependent = (activity) => activity?.weatherDependent ?? WEATHER_DEPENDENT_TYPES.includes(activity?.activityType);
