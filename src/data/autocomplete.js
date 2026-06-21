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
