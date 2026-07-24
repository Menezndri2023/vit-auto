// Liste ISO 3166-1 alpha-2 complète (249 codes) — utilisée pour le sélecteur
// pays à l'inscription (Register.jsx), qui doit accepter n'importe quel pays
// réel, indépendamment de CountryConfig (liste des pays où VIT AUTO a
// configuré une offre commerciale active — voir CurrencyContext.jsx /
// COUNTRIES_CONFIG). Un partenaire doit pouvoir créer un compte depuis
// n'importe où ; CountryConfig ne doit jamais bloquer la création de compte,
// seulement les fonctionnalités commerciales locales (devise, paiement,
// livraison, filtrage catalogue). Miroir de server/utils/countries.js
// (ISO_3166_1_ALPHA2) — garder les deux listes synchronisées.
const ISO_3166_1_ALPHA2 = [
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
];

// Émoji drapeau généré depuis le code ISO (indicateurs régionaux Unicode) —
// évite de maintenir 249 emojis à la main, fonctionne pour tout code ISO-2.
const flagEmoji = (code) =>
  String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));

const regionNames = typeof Intl !== "undefined" && Intl.DisplayNames
  ? new Intl.DisplayNames(["fr"], { type: "region" })
  : null;

export const WORLD_COUNTRIES = ISO_3166_1_ALPHA2
  .map((code) => ({ code, name: regionNames?.of(code) || code, flag: flagEmoji(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));
