// Liste des pays opérationnels VIT AUTO (codes ISO-2) — doit rester synchronisée
// avec COUNTRIES_CONFIG côté frontend (src/context/CurrencyContext.jsx).
// Utilisée pour valider server-side le champ User.country (jamais faire confiance
// à un code envoyé par le client sans le vérifier contre cette liste).
export const VALID_COUNTRY_CODES = [
  "MA", "CI", "SN", "ML", "DZ", "TN", "FR", "BE", "ES", "CH", "US", "CA", "CN",
];

// Code ISO → nom français — pour faire correspondre le pays d'un utilisateur
// (code ISO) aux champs texte libre d'ImportExportListing (sourceCountry,
// availableIn), qui utilisent des noms de pays en français (voir
// src/data/autocomplete.js) plutôt que des codes ISO.
export const COUNTRY_CODE_TO_NAME = {
  MA: "Maroc",
  CI: "Côte d'Ivoire",
  SN: "Sénégal",
  ML: "Mali",
  DZ: "Algérie",
  TN: "Tunisie",
  FR: "France",
  BE: "Belgique",
  ES: "Espagne",
  CH: "Suisse",
  US: "États-Unis",
  CA: "Canada",
  CN: "Chine",
};

export function isValidCountryCode(code) {
  return typeof code === "string" && VALID_COUNTRY_CODES.includes(code.toUpperCase());
}
