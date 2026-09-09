// ═══════════════════════════════════════════════════════════════════════════
// PAYS D'ORIGINE À L'IMPORT (backend) — miroir de src/constants/importOrigins.js
// ═══════════════════════════════════════════════════════════════════════════
// Ce dépôt n'a pas de dossier partagé entre server/ et src/ : la table est
// donc dupliquée, comme l'est déjà celle des Incoterms.
//
// `ImportExportListing.sourceCountry` est une CHAÎNE LIBRE. La base contient
// aujourd'hui « CHINA », « China », « china », « chi'na » et « 中国 » pour un
// même pays. Sans normalisation, aucun taux préférentiel ne peut être appliqué
// correctement — et un véhicule d'origine UE se verrait taxer au taux plein.

export const IMPORT_ORIGINS = [
  { code: "CN", name: "Chine" },
  { code: "JP", name: "Japon" },
  { code: "AE", name: "Dubaï" },
  { code: "KR", name: "Corée du Sud" },
  { code: "DE", name: "Allemagne" },
  { code: "FR", name: "France" },
  { code: "BE", name: "Belgique" },
  { code: "NL", name: "Pays-Bas" },
  { code: "IT", name: "Italie" },
  { code: "ES", name: "Espagne" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "SE", name: "Suède" },
  { code: "CZ", name: "Rép. tchèque" },
  { code: "CA", name: "Canada" },
  { code: "US", name: "États-Unis" },
];

const ALIAS = {
  chine: "CN", china: "CN", "chi'na": "CN", 中国: "CN", cn: "CN",
  japon: "JP", japan: "JP", 日本: "JP", jp: "JP",
  "émirats": "AE", emirats: "AE", "emirats arabes unis": "AE", uae: "AE", dubai: "AE", "dubaï": "AE",
  "corée du sud": "KR", "south korea": "KR", korea: "KR", kr: "KR",
  allemagne: "DE", germany: "DE", 德国: "DE", de: "DE",
  france: "FR", fr: "FR",
  belgique: "BE", belgium: "BE", be: "BE",
  "pays-bas": "NL", netherlands: "NL", nl: "NL",
  italie: "IT", italy: "IT", it: "IT",
  espagne: "ES", spain: "ES", es: "ES",
  "royaume-uni": "GB", "united kingdom": "GB", uk: "GB", gb: "GB",
  "suède": "SE", sweden: "SE", se: "SE",
  "république tchèque": "CZ", "rép. tchèque": "CZ", "czech republic": "CZ", cz: "CZ",
  canada: "CA", ca: "CA",
  "états-unis": "US", "united states": "US", usa: "US", 美国: "US", us: "US",
};

export function resolveOriginCode(valeur) {
  if (!valeur || typeof valeur !== "string") return null;
  return ALIAS[valeur.trim().toLowerCase()] || null;
}

// Origines couvertes par l'accord d'association Maroc–UE (droit d'importation
// très réduit). Sert à amorcer le barème marocain ; l'admin peut l'ajuster.
export const EU_ORIGINS = ["DE", "FR", "BE", "NL", "IT", "ES", "SE", "CZ"];
