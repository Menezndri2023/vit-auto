// Catégories de permis de conduire — nomenclature internationale (Convention
// de Vienne 1968 / harmonisation UE), reprise telle quelle par la plupart des
// pays francophones y compris la Côte d'Ivoire et le Maroc. Dupliqué à
// l'identique dans src/constants/licenseCategories.js (pas de dossier partagé
// entre server/ et src/ dans ce repo — voir server/constants/incoterms.js
// pour le même principe).
export const LICENSE_CATEGORIES = [
  "AM", "A1", "A2", "A",
  "B1", "B", "BE",
  "C1", "C1E", "C", "CE",
  "D1", "D1E", "D", "DE",
];

export const LICENSE_CATEGORY_LABELS = {
  AM:  "AM — Cyclomoteurs (dès 14 ans)",
  A1:  "A1 — Motocyclette légère (125 cm³)",
  A2:  "A2 — Motocyclette intermédiaire",
  A:   "A — Motocyclette",
  B1:  "B1 — Quadricycle lourd",
  B:   "B — Voiture particulière",
  BE:  "BE — Voiture + remorque",
  C1:  "C1 — Camion léger",
  C1E: "C1E — Camion léger + remorque",
  C:   "C — Poids lourd",
  CE:  "CE — Poids lourd + remorque",
  D1:  "D1 — Minibus",
  D1E: "D1E — Minibus + remorque",
  D:   "D — Autobus / Autocar",
  DE:  "DE — Autobus / Autocar + remorque",
};

// Pseudo-pays de délivrance pour un Permis de Conduire International (PCI) —
// document complémentaire au permis national (Convention de Vienne 1968),
// pas rattaché à un pays précis. Ajouté à la liste des pays réels (voir
// WORLD_COUNTRIES / server/utils/countries.js) plutôt qu'un nouveau type de
// document séparé : il s'agit toujours d'un permis de conduire, seule
// l'autorité de délivrance diffère.
export const INTERNATIONAL_LICENSE_CODE = "INTERNATIONAL";
export const INTERNATIONAL_LICENSE_LABEL = "🌍 Permis de conduire international";
