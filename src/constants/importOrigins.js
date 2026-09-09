// ═══════════════════════════════════════════════════════════════════════════
// PAYS D'ORIGINE À L'IMPORT — source unique
// ═══════════════════════════════════════════════════════════════════════════
// La page d'accueil n'annonçait que « Japon · Europe · Dubaï » sous la barre de
// recherche, alors que le catalogue Import/Export contient des annonces
// venues de Chine, de France, d'Allemagne, d'Italie, du Japon, de Corée du Sud,
// de Suède, de République tchèque, du Royaume-Uni et des États-Unis. Un
// visiteur cherchant une importation depuis la Chine — de loin la première
// origine du stock — n'avait aucune raison de croire que c'était possible.
//
// À NE PAS CONFONDRE avec la liste de ImportExport.jsx, qui mélange origines et
// destinations sous l'intitulé « couverture mondiale ». Ici, uniquement des
// pays DEPUIS lesquels on importe.
//
// Une origine reste listée même sans annonce en stock à l'instant T : elle
// décrit un corridor logistique ouvert (accord transitaire, ligne maritime),
// pas un inventaire. Le nombre réel d'annonces, lui, est affiché ailleurs et
// vient de la base (voir GET /api/vehicles/public-stats).

export const IMPORT_ORIGINS = [
  { code: "CN", flag: "🇨🇳", name: "Chine" },
  { code: "JP", flag: "🇯🇵", name: "Japon" },
  { code: "AE", flag: "🇦🇪", name: "Dubaï" },
  { code: "KR", flag: "🇰🇷", name: "Corée du Sud" },
  { code: "DE", flag: "🇩🇪", name: "Allemagne" },
  { code: "FR", flag: "🇫🇷", name: "France" },
  { code: "BE", flag: "🇧🇪", name: "Belgique" },
  { code: "NL", flag: "🇳🇱", name: "Pays-Bas" },
  { code: "IT", flag: "🇮🇹", name: "Italie" },
  { code: "ES", flag: "🇪🇸", name: "Espagne" },
  { code: "GB", flag: "🇬🇧", name: "Royaume-Uni" },
  { code: "SE", flag: "🇸🇪", name: "Suède" },
  { code: "CZ", flag: "🇨🇿", name: "Rép. tchèque" },
  { code: "CA", flag: "🇨🇦", name: "Canada" },
  { code: "US", flag: "🇺🇸", name: "États-Unis" },
];

// Résout une valeur libre de `ImportExportListing.sourceCountry` vers une
// origine connue. Indispensable : ce champ est une CHAÎNE LIBRE, et la base
// contient aujourd'hui « CHINA », « China », « china », « chi'na » et « 中国 »
// pour un même pays — sans cette normalisation, tout filtre par origine est
// faux.
const ALIAS = {
  chine: "CN", china: "CN", "chi'na": "CN", 中国: "CN", cn: "CN",
  japon: "JP", japan: "JP", 日本: "JP", jp: "JP",
  "émirats": "AE", emirats: "AE", "emirats arabes unis": "AE", uae: "AE", dubai: "AE", "dubaï": "AE",
  "corée du sud": "KR", "south korea": "KR", korea: "KR", kr: "KR",
  allemagne: "DE", germany: "DE", "德国": "DE", de: "DE",
  france: "FR", fr: "FR",
  belgique: "BE", belgium: "BE", be: "BE",
  "pays-bas": "NL", netherlands: "NL", nl: "NL",
  italie: "IT", italy: "IT", it: "IT",
  espagne: "ES", spain: "ES", es: "ES",
  "royaume-uni": "GB", "united kingdom": "GB", uk: "GB", gb: "GB",
  "suède": "SE", sweden: "SE", se: "SE",
  "république tchèque": "CZ", "rép. tchèque": "CZ", "czech republic": "CZ", cz: "CZ",
  canada: "CA", ca: "CA",
  "états-unis": "US", "united states": "US", usa: "US", "美国": "US", us: "US",
};

export function resolveImportOrigin(valeur) {
  if (!valeur || typeof valeur !== "string") return null;
  const code = ALIAS[valeur.trim().toLowerCase()];
  return IMPORT_ORIGINS.find((o) => o.code === code) || null;
}
