import CountryConfig from "../models/CountryConfig.js";

// Code ISO → nom français — pour faire correspondre le pays d'un utilisateur
// (code ISO) aux champs texte libre d'ImportExportListing (sourceCountry,
// availableIn), qui utilisent des noms de pays en français (voir
// src/data/autocomplete.js) plutôt que des codes ISO. Repli minimal utilisé
// uniquement si CountryConfig n'a pas (encore) cette entrée — voir
// isValidCountryCode ci-dessous pour la vraie source de vérité.
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

// Valide un code pays ISO-2 contre CountryConfig — la vraie source de vérité
// des pays supportés depuis la refonte du modèle économique (voir
// server/models/CountryConfig.js), pas une liste figée dans le code. Avant ce
// correctif, cette fonction comparait à une liste de 13 pays codée en dur
// (jamais mise à jour depuis), alors que CountryConfig en compte déjà 27 —
// un utilisateur choisissant par ex. le Ghana, le Nigeria, l'Allemagne ou les
// Émirats Arabes Unis dans le sélecteur de pays (alimenté par CountryConfig,
// voir CurrencyContext.jsx) se voyait rejeté à l'inscription avec "Pays
// invalide", alors que son pays était bien listé et actif.
export async function isValidCountryCode(code) {
  if (typeof code !== "string") return false;
  const country = await CountryConfig.findOne({ code: code.toUpperCase(), active: true }).select("_id").lean();
  return !!country;
}
