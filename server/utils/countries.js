// Liste ISO 3166-1 alpha-2 complète (249 codes) — source de vérité de
// isValidCountryCode() ci-dessous. Volontairement indépendante de
// CountryConfig (qui reste la source de vérité pour ce à quoi le business a
// besoin d'un pays : devise par défaut, moyens de paiement, frais de
// livraison, filtrage catalogue) car un partenaire doit pouvoir CRÉER UN
// COMPTE depuis n'importe quel pays réel, même avant que VIT AUTO n'y ait
// configuré d'offre commerciale.
const ISO_3166_1_ALPHA2 = new Set([
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
  "DE","DJ","DK","DM","DO","DZ",
  "EC","EE","EG","EH","ER","ES","ET",
  "FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
  "HK","HM","HN","HR","HT","HU",
  "ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT",
  "JE","JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ",
  "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ",
  "OM",
  "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY",
  "QA",
  "RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
  "UA","UG","UM","US","UY","UZ",
  "VA","VC","VE","VG","VI","VN","VU",
  "WF","WS",
  "YE","YT",
  "ZA","ZM","ZW",
]);

// Code ISO → nom français — pour faire correspondre le pays d'un utilisateur
// (code ISO) aux champs texte libre d'ImportExportListing (sourceCountry,
// availableIn), qui utilisent des noms de pays en français (voir
// src/data/autocomplete.js) plutôt que des codes ISO. Repli minimal utilisé
// uniquement si CountryConfig n'a pas (encore) cette entrée.
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

// Valide un code pays ISO-2 contre la liste ISO 3166-1 complète — plus contre
// CountryConfig (liste d'une trentaine de pays où VIT AUTO a configuré une
// offre commerciale active). Avant ce correctif, un partenaire situé dans un
// pays réel mais pas encore dans CountryConfig (ex: Kenya, Brésil, Afrique du
// Sud, Inde...) se voyait rejeté à l'inscription avec "Pays invalide" — alors
// que l'inscription d'un compte ne devrait jamais dépendre du périmètre de
// déploiement commercial. CountryConfig reste utilisé ailleurs (devise par
// défaut, moyens de paiement, frais de livraison, filtrage catalogue).
export async function isValidCountryCode(code) {
  if (typeof code !== "string") return false;
  return ISO_3166_1_ALPHA2.has(code.toUpperCase());
}
