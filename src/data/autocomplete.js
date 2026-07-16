// Données pour la saisie automatique (autocomplete) à travers le site
export const CAR_MAKES = [
  "Toyota", "BMW", "Mercedes-Benz", "Volkswagen", "Audi", "Ford",
  "Renault", "Peugeot", "Citroën", "Hyundai", "Kia", "Honda",
  "Nissan", "Mitsubishi", "Land Rover", "Range Rover", "Jeep",
  "Volvo", "Subaru", "Mazda", "Lexus", "Infiniti", "Acura",
  "BYD", "Geely", "Chery", "Great Wall", "SAIC", "JAC", "Haval",
  "Isuzu", "Suzuki", "Dacia", "Seat", "Skoda", "Opel", "Fiat",
  "Alfa Romeo", "Lancia", "Ferrari", "Lamborghini", "Porsche",
  "Maserati", "Bentley", "Rolls-Royce", "Bugatti", "McLaren",
  "Rivian", "Tesla", "Lucid", "NIO", "XPENG", "Li Auto",
];

export const VEHICLE_TYPES = [
  "Berline", "SUV / 4x4", "Pick-up", "Utilitaire léger", "Camion",
  "Minibus / Van", "Coupé", "Cabriolet", "Break", "Monospace",
  "Citadine", "Crossover", "Moto", "Scooter", "Tricycle",
  "Véhicule électrique", "Hybride", "Luxe / Premium",
];

export const BODY_TYPES = [
  "Berline", "SUV", "Pick-up", "Break", "Coupé", "Cabriolet",
  "Monospace", "Minibus", "Fourgon", "Camionnette", "Utilitaire",
  "Crossover", "Roadster", "Citadine",
];

export const FUEL_TYPES = [
  "Essence", "Diesel", "Hybride", "Hybride rechargeable",
  "Électrique", "GPL", "GNV", "Éthanol",
];

export const TRANSMISSIONS = ["Automatique", "Manuelle", "CVT", "Semi-automatique"];

export const CONDITIONS = ["Neuf", "Occasion", "Reconditionné", "Accidenté (à réparer)"];

// ── Pays ──────────────────────────────────────────────────────────────────────
export const COUNTRIES_AFRIQUE_OUEST = [
  "Côte d'Ivoire", "Sénégal", "Ghana", "Nigeria", "Bénin", "Togo",
  "Mali", "Guinée", "Guinée-Bissau", "Burkina Faso", "Niger",
  "Sierra Leone", "Liberia", "Gambie", "Mauritanie", "Cap-Vert",
];

export const COUNTRIES_MAGHREB = [
  "Maroc", "Algérie", "Tunisie", "Libye", "Mauritanie", "Égypte",
];

export const COUNTRIES_EUROPE = [
  "France", "Allemagne", "Belgique", "Pays-Bas", "Espagne", "Italie",
  "Portugal", "Suisse", "Autriche", "Suède", "Norvège", "Danemark",
  "Finlande", "Pologne", "Royaume-Uni", "Irlande", "Luxembourg",
];

export const COUNTRIES_ASIE = [
  "Chine", "Japon", "Corée du Sud", "Inde", "Thaïlande", "Vietnam",
  "Singapour", "Malaisie", "Indonésie", "Hong Kong", "Taiwan",
];

export const COUNTRIES_MOYEN_ORIENT = [
  "Émirats Arabes Unis", "Arabie Saoudite", "Qatar", "Koweït",
  "Bahreïn", "Oman", "Jordanie", "Liban", "Turquie",
];

export const COUNTRIES_ALL = [
  ...COUNTRIES_AFRIQUE_OUEST,
  ...COUNTRIES_MAGHREB,
  ...COUNTRIES_EUROPE,
  ...COUNTRIES_ASIE,
  ...COUNTRIES_MOYEN_ORIENT,
  "États-Unis", "Canada", "Mexique", "Brésil", "Australie",
];

// ── Drapeaux pays (saisie libre avec suggestion datalist — voir sourceCountry/
// availableIn d'une annonce Import/Export) ───────────────────────────────────
export const COUNTRY_FLAGS = {
  "Côte d'Ivoire": "🇨🇮", "Sénégal": "🇸🇳", "Ghana": "🇬🇭", "Nigeria": "🇳🇬",
  "Bénin": "🇧🇯", "Togo": "🇹🇬", "Mali": "🇲🇱", "Guinée": "🇬🇳",
  "Guinée-Bissau": "🇬🇼", "Burkina Faso": "🇧🇫", "Niger": "🇳🇪",
  "Sierra Leone": "🇸🇱", "Liberia": "🇱🇷", "Gambie": "🇬🇲",
  "Mauritanie": "🇲🇷", "Cap-Vert": "🇨🇻",
  "Maroc": "🇲🇦", "Algérie": "🇩🇿", "Tunisie": "🇹🇳", "Libye": "🇱🇾", "Égypte": "🇪🇬",
  "France": "🇫🇷", "Allemagne": "🇩🇪", "Belgique": "🇧🇪", "Pays-Bas": "🇳🇱",
  "Espagne": "🇪🇸", "Italie": "🇮🇹", "Portugal": "🇵🇹", "Suisse": "🇨🇭",
  "Autriche": "🇦🇹", "Suède": "🇸🇪", "Norvège": "🇳🇴", "Danemark": "🇩🇰",
  "Finlande": "🇫🇮", "Pologne": "🇵🇱", "Royaume-Uni": "🇬🇧", "Irlande": "🇮🇪",
  "Luxembourg": "🇱🇺",
  "Chine": "🇨🇳", "Japon": "🇯🇵", "Corée du Sud": "🇰🇷", "Inde": "🇮🇳",
  "Thaïlande": "🇹🇭", "Vietnam": "🇻🇳", "Singapour": "🇸🇬", "Malaisie": "🇲🇾",
  "Indonésie": "🇮🇩", "Hong Kong": "🇭🇰", "Taiwan": "🇹🇼",
  "Émirats Arabes Unis": "🇦🇪", "Dubaï": "🇦🇪", "Arabie Saoudite": "🇸🇦",
  "Qatar": "🇶🇦", "Koweït": "🇰🇼", "Bahreïn": "🇧🇭", "Oman": "🇴🇲",
  "Jordanie": "🇯🇴", "Liban": "🇱🇧", "Turquie": "🇹🇷",
  "États-Unis": "🇺🇸", "Canada": "🇨🇦", "Mexique": "🇲🇽", "Brésil": "🇧🇷", "Australie": "🇦🇺",
};

export const getCountryFlag = (name) => COUNTRY_FLAGS[name?.trim()] || "🌍";

// ── Villes Côte d'Ivoire ──────────────────────────────────────────────────────
export const CITIES_CI = [
  "Abidjan", "Bouaké", "Yamoussoukro", "Korhogo", "San Pedro",
  "Daloa", "Man", "Gagnoa", "Abengourou", "Divo", "Sassandra",
  "Grand-Bassam", "Anyama", "Bingerville", "Agboville", "Dimbokro",
  "Bondoukou", "Odienné", "Séguéla", "Toumodi",
];

export const CITIES_AFRIQUE = [
  "Abidjan", "Dakar", "Accra", "Lagos", "Cotonou", "Lomé",
  "Bamako", "Conakry", "Ouagadougou", "Niamey", "Freetown",
  "Monrovia", "Banjul", "Nouakchott", "Casablanca", "Alger",
  "Tunis", "Tripoli", "Le Caire", "Johannesburg", "Nairobi",
  "Douala", "Yaoundé", "Libreville", "Kinshasa",
];

// ── Marques partenaires / références ─────────────────────────────────────────
export const PARTNER_REFERENCES = [
  "Toyota CI", "BYD Africa", "DHL Logistics", "Bolloré Logistics",
  "Maersk", "CMA CGM", "Orange CI", "MTN Côte d'Ivoire",
  "Société Générale CI", "BICICI", "NSIA Banque",
  "CFAO Motors", "SDTM", "Tractafric Motors",
];

// ── Devises ───────────────────────────────────────────────────────────────────
export const CURRENCIES = [
  { code: "XOF", label: "FCFA (XOF)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dollar US (USD)" },
  { code: "GBP", label: "Livre sterling (GBP)" },
  { code: "AED", label: "Dirham EAU (AED)" },
  { code: "CNY", label: "Yuan chinois (CNY)" },
  { code: "MAD", label: "Dirham marocain (MAD)" },
  { code: "GHS", label: "Cedi ghanéen (GHS)" },
  { code: "NGN", label: "Naira nigérian (NGN)" },
];

// ── Indicatifs téléphoniques par pays (ISO 3166-1 alpha-2) ────────────────────
// Utilisé pour pré-remplir l'indicatif à la publication depuis le pays détecté
// par géolocalisation IP (voir /api/geo/my-country) — jamais le numéro complet,
// seulement le préfixe, l'utilisateur reste seul à saisir son propre numéro.
export const CALLING_CODES = {
  MA: "+212", CI: "+225", SN: "+221", ML: "+223", DZ: "+213", TN: "+216",
  FR: "+33",  BE: "+32",  ES: "+34",  CH: "+41",  US: "+1",   CA: "+1",
  CN: "+86",  GH: "+233", NG: "+234", BJ: "+229", TG: "+228", GN: "+224",
  BF: "+226", NE: "+227", SL: "+232", LR: "+231", GM: "+220", MR: "+222",
  CV: "+238", LY: "+218", EG: "+20",  DE: "+49",  NL: "+31",  PT: "+351",
  SE: "+46",  NO: "+47",  DK: "+45",  FI: "+358", PL: "+48",  GB: "+44",
  IE: "+353", LU: "+352", JP: "+81",  KR: "+82",  IN: "+91",  TH: "+66",
  VN: "+84",  SG: "+65",  MY: "+60",  ID: "+62",  HK: "+852", TW: "+886",
  AE: "+971", SA: "+966", QA: "+974", KW: "+965", BH: "+973", OM: "+968",
  JO: "+962", LB: "+961", TR: "+90",  MX: "+52",  BR: "+55",  AU: "+61",
};
