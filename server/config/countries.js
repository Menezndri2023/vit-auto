/**
 * Configuration internationale VIT AUTO
 * Pays supportés, devises, taux de conversion, méthodes de paiement, types de partenaires
 */

// Taux de conversion vers XOF (FCFA) — base de référence interne
export const EXCHANGE_RATES = {
  XOF: 1,          // FCFA (CI, SN, ML, BF, TG, BJ…)
  XAF: 1,          // FCFA zone CEMAC (Cameroun, Gabon…)
  MAD: 60.5,       // Dirham marocain
  EUR: 655.957,    // Euro (taux fixe zone CFA)
  USD: 600,        // Dollar US (approx)
  GBP: 765,        // Livre sterling
  AED: 163,        // Dirham EAU (1 AED ≈ 163 FCFA)
  CNY: 83,         // Yuan chinois (1 CNY ≈ 83 FCFA)
  GHS: 40,         // Cedi ghanéen
  NGN: 0.38,       // Naira nigérian
  MRU: 16,         // Ouguiya mauritanien
  CHF: 680,        // Franc suisse
  CAD: 445,        // Dollar canadien
  DZD: 4.5,        // Dinar algérien
  TND: 195,        // Dinar tunisien
  GNF: 0.067,      // Franc guinéen
};

export const COUNTRIES = [
  // ── Afrique de l'Ouest ────────────────────────────────────────────────
  {
    code: "CI",
    name: "Côte d'Ivoire",
    flag: "🇨🇮",
    currency: "XOF",
    currencySymbol: "FCFA",
    locale: "fr-CI",
    phone: "+225",
    languages: ["fr"],
    paymentMethods: ["orange_money", "mtn", "moov", "wave", "card", "cash"],
    deliveryRatePerKm: 200,    // FCFA/km
    deliveryBaseRate: 1000,    // FCFA base fixe
    deliveryMaxKm: 100,
  },
  {
    code: "SN",
    name: "Sénégal",
    flag: "🇸🇳",
    currency: "XOF",
    currencySymbol: "FCFA",
    locale: "fr-SN",
    phone: "+221",
    languages: ["fr"],
    paymentMethods: ["orange_money", "wave", "free_money", "card", "cash"],
    deliveryRatePerKm: 180,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 100,
  },
  {
    code: "ML",
    name: "Mali",
    flag: "🇲🇱",
    currency: "XOF",
    currencySymbol: "FCFA",
    locale: "fr-ML",
    phone: "+223",
    languages: ["fr"],
    paymentMethods: ["orange_money", "moov", "card", "cash"],
    deliveryRatePerKm: 180,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 100,
  },
  {
    code: "BF",
    name: "Burkina Faso",
    flag: "🇧🇫",
    currency: "XOF",
    currencySymbol: "FCFA",
    locale: "fr-BF",
    phone: "+226",
    languages: ["fr"],
    paymentMethods: ["orange_money", "moov", "card", "cash"],
    deliveryRatePerKm: 180,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 100,
  },
  {
    code: "GN",
    name: "Guinée",
    flag: "🇬🇳",
    currency: "GNF",
    currencySymbol: "GNF",
    locale: "fr-GN",
    phone: "+224",
    languages: ["fr"],
    paymentMethods: ["orange_money", "mtn", "card", "cash"],
    deliveryRatePerKm: 200,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 80,
  },
  // ── Afrique de l'Ouest (suite) ────────────────────────────────────────
  {
    code: "GH",
    name: "Ghana",
    flag: "🇬🇭",
    currency: "GHS",
    currencySymbol: "GH₵",
    locale: "en-GH",
    phone: "+233",
    languages: ["en"],
    paymentMethods: ["mtn", "vodafone_cash", "airteltigo", "card", "cash"],
    deliveryRatePerKm: 2,
    deliveryBaseRate: 10,
    deliveryMaxKm: 150,
  },
  {
    code: "NG",
    name: "Nigeria",
    flag: "🇳🇬",
    currency: "NGN",
    currencySymbol: "₦",
    locale: "en-NG",
    phone: "+234",
    languages: ["en"],
    paymentMethods: ["flutterwave", "paystack", "mtn", "airtel", "card", "cash"],
    deliveryRatePerKm: 150,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 200,
  },
  {
    code: "TG",
    name: "Togo",
    flag: "🇹🇬",
    currency: "XOF",
    currencySymbol: "FCFA",
    locale: "fr-TG",
    phone: "+228",
    languages: ["fr"],
    paymentMethods: ["tmoney", "flooz", "orange_money", "card", "cash"],
    deliveryRatePerKm: 180,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 100,
  },
  {
    code: "BJ",
    name: "Bénin",
    flag: "🇧🇯",
    currency: "XOF",
    currencySymbol: "FCFA",
    locale: "fr-BJ",
    phone: "+229",
    languages: ["fr"],
    paymentMethods: ["mtn", "moov", "card", "cash"],
    deliveryRatePerKm: 180,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 100,
  },
  {
    code: "CM",
    name: "Cameroun",
    flag: "🇨🇲",
    currency: "XAF",
    currencySymbol: "FCFA",
    locale: "fr-CM",
    phone: "+237",
    languages: ["fr"],
    paymentMethods: ["orange_money", "mtn", "card", "cash"],
    deliveryRatePerKm: 200,
    deliveryBaseRate: 1000,
    deliveryMaxKm: 150,
  },
  // ── Moyen-Orient ───────────────────────────────────────────────────────
  {
    code: "AE",
    name: "Émirats Arabes Unis",
    flag: "🇦🇪",
    currency: "AED",
    currencySymbol: "AED",
    locale: "ar-AE",
    phone: "+971",
    languages: ["ar", "en"],
    paymentMethods: ["stripe", "paypal", "card", "apple_pay", "google_pay"],
    deliveryRatePerKm: 1.5,
    deliveryBaseRate: 10,
    deliveryMaxKm: 500,
  },
  // ── Asie ───────────────────────────────────────────────────────────────
  {
    code: "CN",
    name: "Chine",
    flag: "🇨🇳",
    currency: "CNY",
    currencySymbol: "¥",
    locale: "zh-CN",
    phone: "+86",
    languages: ["zh"],
    paymentMethods: ["alipay", "wechat_pay", "card", "unionpay"],
    deliveryRatePerKm: 4,
    deliveryBaseRate: 20,
    deliveryMaxKm: 1000,
  },
  // ── Afrique du Nord ────────────────────────────────────────────────────
  {
    code: "MA",
    name: "Maroc",
    flag: "🇲🇦",
    currency: "MAD",
    currencySymbol: "DH",
    locale: "fr-MA",
    phone: "+212",
    languages: ["fr", "ar"],
    paymentMethods: ["cmi", "cih", "banque_populaire", "card", "cash"],
    deliveryRatePerKm: 3,      // MAD/km
    deliveryBaseRate: 15,
    deliveryMaxKm: 200,
  },
  {
    code: "DZ",
    name: "Algérie",
    flag: "🇩🇿",
    currency: "DZD",
    currencySymbol: "DA",
    locale: "fr-DZ",
    phone: "+213",
    languages: ["fr", "ar"],
    paymentMethods: ["ccp", "card", "cash"],
    deliveryRatePerKm: 25,
    deliveryBaseRate: 200,
    deliveryMaxKm: 200,
  },
  {
    code: "TN",
    name: "Tunisie",
    flag: "🇹🇳",
    currency: "TND",
    currencySymbol: "DT",
    locale: "fr-TN",
    phone: "+216",
    languages: ["fr", "ar"],
    paymentMethods: ["flouci", "card", "cash"],
    deliveryRatePerKm: 0.5,
    deliveryBaseRate: 3,
    deliveryMaxKm: 200,
  },
  // ── Europe ─────────────────────────────────────────────────────────────
  {
    code: "FR",
    name: "France",
    flag: "🇫🇷",
    currency: "EUR",
    currencySymbol: "€",
    locale: "fr-FR",
    phone: "+33",
    languages: ["fr"],
    paymentMethods: ["stripe", "paypal", "card", "sepa"],
    deliveryRatePerKm: 0.8,
    deliveryBaseRate: 5,
    deliveryMaxKm: 500,
  },
  {
    code: "BE",
    name: "Belgique",
    flag: "🇧🇪",
    currency: "EUR",
    currencySymbol: "€",
    locale: "fr-BE",
    phone: "+32",
    languages: ["fr"],
    paymentMethods: ["stripe", "paypal", "card", "bancontact"],
    deliveryRatePerKm: 0.8,
    deliveryBaseRate: 5,
    deliveryMaxKm: 300,
  },
  {
    code: "ES",
    name: "Espagne",
    flag: "🇪🇸",
    currency: "EUR",
    currencySymbol: "€",
    locale: "es-ES",
    phone: "+34",
    languages: ["fr", "es"],
    paymentMethods: ["stripe", "paypal", "card", "bizum"],
    deliveryRatePerKm: 0.8,
    deliveryBaseRate: 5,
    deliveryMaxKm: 500,
  },
  {
    code: "CH",
    name: "Suisse",
    flag: "🇨🇭",
    currency: "CHF",
    currencySymbol: "CHF",
    locale: "fr-CH",
    phone: "+41",
    languages: ["fr"],
    paymentMethods: ["stripe", "twint", "card", "paypal"],
    deliveryRatePerKm: 1.2,
    deliveryBaseRate: 8,
    deliveryMaxKm: 300,
  },
  // ── Amérique du Nord ────────────────────────────────────────────────────
  {
    code: "US",
    name: "États-Unis",
    flag: "🇺🇸",
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    phone: "+1",
    languages: ["en"],
    paymentMethods: ["stripe", "paypal", "card", "apple_pay", "google_pay"],
    deliveryRatePerKm: 1.2,
    deliveryBaseRate: 8,
    deliveryMaxKm: 500,
  },
  {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    currency: "CAD",
    currencySymbol: "CA$",
    locale: "fr-CA",
    phone: "+1",
    languages: ["fr", "en"],
    paymentMethods: ["stripe", "paypal", "card", "interac"],
    deliveryRatePerKm: 1.0,
    deliveryBaseRate: 7,
    deliveryMaxKm: 500,
  },
];

// Types de partenaires (tous pays)
export const PARTNER_TYPES = [
  { id: "agency",        label: { fr: "Agence de location",      en: "Car Rental Agency",       ar: "وكالة تأجير سيارات"       } },
  { id: "dealer",        label: { fr: "Concessionnaire",          en: "Car Dealer",              ar: "تاجر سيارات"              } },
  { id: "individual",    label: { fr: "Particulier",              en: "Individual",              ar: "فرد"                      } },
  { id: "fleet",         label: { fr: "Gestionnaire de flotte",   en: "Fleet Manager",           ar: "مدير أسطول"              } },
  { id: "leasing_co",   label: { fr: "Société de leasing",       en: "Leasing Company",         ar: "شركة تمويل"              } },
];

// Méthodes de paiement avec labels et icônes
export const PAYMENT_METHODS_CATALOG = {
  orange_money:    { label: "Orange Money",        icon: "🟠", regions: ["CI", "SN", "ML", "BF", "GN"] },
  mtn:             { label: "MTN Mobile Money",    icon: "🟡", regions: ["CI", "GN"] },
  moov:            { label: "Moov Money",          icon: "🔵", regions: ["CI", "ML", "BF"] },
  wave:            { label: "Wave",                icon: "💙", regions: ["CI", "SN"] },
  free_money:      { label: "Free Money",          icon: "🟢", regions: ["SN"] },
  cmi:             { label: "CMI (Maroc)",         icon: "🇲🇦", regions: ["MA"] },
  cih:             { label: "CIH Bank",            icon: "🏦", regions: ["MA"] },
  banque_populaire:{ label: "Banque Populaire",    icon: "🏦", regions: ["MA"] },
  flouci:          { label: "Flouci",              icon: "💳", regions: ["TN"] },
  ccp:             { label: "CCP Algérie",         icon: "🏦", regions: ["DZ"] },
  stripe:          { label: "Stripe",              icon: "💳", regions: ["FR","BE","ES","CH","US","CA"] },
  paypal:          { label: "PayPal",              icon: "🅿️", regions: ["FR","BE","ES","CH","US","CA"] },
  sepa:            { label: "Virement SEPA",       icon: "🏦", regions: ["FR","BE","ES"] },
  bancontact:      { label: "Bancontact",          icon: "🇧🇪", regions: ["BE"] },
  bizum:           { label: "Bizum",               icon: "📱", regions: ["ES"] },
  twint:           { label: "TWINT",               icon: "🇨🇭", regions: ["CH"] },
  interac:         { label: "Interac",             icon: "🇨🇦", regions: ["CA"] },
  apple_pay:       { label: "Apple Pay",           icon: "🍎", regions: ["US","CA","FR","BE","ES","AE"] },
  google_pay:      { label: "Google Pay",          icon: "🟢", regions: ["US","CA","FR","BE","ES","AE"] },
  alipay:          { label: "Alipay",              icon: "🔵", regions: ["CN"] },
  wechat_pay:      { label: "WeChat Pay",          icon: "🟢", regions: ["CN"] },
  unionpay:        { label: "UnionPay",            icon: "🔴", regions: ["CN"] },
  flutterwave:     { label: "Flutterwave",         icon: "🟡", regions: ["NG","GH","TG","BJ","CM"] },
  paystack:        { label: "Paystack",            icon: "🟢", regions: ["NG","GH"] },
  vodafone_cash:   { label: "Vodafone Cash",       icon: "🔴", regions: ["GH"] },
  airteltigo:      { label: "AirtelTigo Money",    icon: "🔵", regions: ["GH"] },
  tmoney:          { label: "T-Money",             icon: "🟠", regions: ["TG"] },
  flooz:           { label: "Flooz",               icon: "🔵", regions: ["TG"] },
  card:            { label: "Carte bancaire",      icon: "💳", regions: ["*"] },
  cash:            { label: "Espèces",             icon: "💵", regions: ["*"] },
};

/**
 * Convertit un montant de XOF vers la devise cible
 * @param {number} amountXOF - montant en FCFA
 * @param {string} targetCurrency - code devise (EUR, MAD, USD…)
 * @returns {number}
 */
export function convertFromXOF(amountXOF, targetCurrency) {
  const rate = EXCHANGE_RATES[targetCurrency];
  if (!rate) return amountXOF;
  return Math.round((amountXOF / rate) * 100) / 100;
}

/**
 * Convertit un montant vers XOF
 */
export function convertToXOF(amount, fromCurrency) {
  const rate = EXCHANGE_RATES[fromCurrency];
  if (!rate) return amount;
  return Math.round(amount * rate);
}

/**
 * Calcule les frais de livraison pour un pays et une distance donnés
 * @param {string} countryCode
 * @param {number} distanceKm
 * @returns {{ fee: number, currency: string, feeDisplay: string }}
 */
export function calculateDeliveryFee(countryCode, distanceKm) {
  const country = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
  const km = Math.max(0, distanceKm);

  if (km > country.deliveryMaxKm) {
    return { fee: null, currency: country.currency, feeDisplay: "Livraison non disponible pour cette distance" };
  }

  const fee = Math.round(country.deliveryBaseRate + km * country.deliveryRatePerKm);
  const display = fee.toLocaleString("fr-FR") + " " + country.currencySymbol;
  return { fee, currency: country.currency, feeDisplay: display };
}

/**
 * Retourne la config d'un pays par code
 */
export function getCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

export default COUNTRIES;
