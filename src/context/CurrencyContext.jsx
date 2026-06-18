import { createContext, useContext, useState, useCallback, useEffect } from "react";

const CurrencyContext = createContext(null);

// Taux de conversion vers XOF (base interne)
export const EXCHANGE_RATES = {
  XOF: 1,
  MAD: 60.5,
  EUR: 655.957,
  USD: 600,
  GBP: 765,
  CAD: 450,
  CHF: 680,
  TND: 195,
  DZD: 4.4,
  GNF: 0.065,
};

// Correspondance code pays → devise (pour l'auto-détection)
const COUNTRY_TO_CURRENCY = {
  CI: "XOF", SN: "XOF", ML: "XOF", BF: "XOF", NE: "XOF", TG: "XOF", BJ: "XOF",
  GN: "GNF",
  MA: "MAD",
  DZ: "DZD",
  TN: "TND",
  FR: "EUR", BE: "EUR", ES: "EUR", PT: "EUR", IT: "EUR", DE: "EUR", NL: "EUR",
  CH: "CHF",
  GB: "GBP",
  US: "USD",
  CA: "CAD",
};

// Liste des devises disponibles sur la plateforme
export const CURRENCIES = [
  { code: "XOF", symbol: "FCFA", name: "Franc CFA",      flag: "🌍", locale: "fr-CI" },
  { code: "MAD", symbol: "DH",   name: "Dirham marocain", flag: "🇲🇦", locale: "fr-MA" },
  { code: "EUR", symbol: "€",    name: "Euro",            flag: "🇪🇺", locale: "fr-FR" },
  { code: "USD", symbol: "$",    name: "Dollar US",       flag: "🇺🇸", locale: "en-US" },
  { code: "GBP", symbol: "£",    name: "Livre sterling",  flag: "🇬🇧", locale: "en-GB" },
  { code: "CAD", symbol: "CA$",  name: "Dollar canadien", flag: "🇨🇦", locale: "fr-CA" },
  { code: "CHF", symbol: "CHF",  name: "Franc suisse",    flag: "🇨🇭", locale: "fr-CH" },
  { code: "TND", symbol: "DT",   name: "Dinar tunisien",  flag: "🇹🇳", locale: "fr-TN" },
  { code: "DZD", symbol: "DA",   name: "Dinar algérien",  flag: "🇩🇿", locale: "fr-DZ" },
];

// Garde la compatibilité avec les usages qui lisent COUNTRIES_CONFIG
export const COUNTRIES_CONFIG = [
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", symbol: "FCFA", locale: "fr-CI" },
  { code: "SN", name: "Sénégal",       flag: "🇸🇳", currency: "XOF", symbol: "FCFA", locale: "fr-SN" },
  { code: "ML", name: "Mali",          flag: "🇲🇱", currency: "XOF", symbol: "FCFA", locale: "fr-ML" },
  { code: "MA", name: "Maroc",         flag: "🇲🇦", currency: "MAD", symbol: "DH",   locale: "fr-MA" },
  { code: "DZ", name: "Algérie",       flag: "🇩🇿", currency: "DZD", symbol: "DA",   locale: "fr-DZ" },
  { code: "TN", name: "Tunisie",       flag: "🇹🇳", currency: "TND", symbol: "DT",   locale: "fr-TN" },
  { code: "FR", name: "France",        flag: "🇫🇷", currency: "EUR", symbol: "€",    locale: "fr-FR" },
  { code: "BE", name: "Belgique",      flag: "🇧🇪", currency: "EUR", symbol: "€",    locale: "fr-BE" },
  { code: "ES", name: "Espagne",       flag: "🇪🇸", currency: "EUR", symbol: "€",    locale: "es-ES" },
  { code: "CH", name: "Suisse",        flag: "🇨🇭", currency: "CHF", symbol: "CHF",  locale: "fr-CH" },
  { code: "US", name: "États-Unis",    flag: "🇺🇸", currency: "USD", symbol: "$",    locale: "en-US" },
  { code: "CA", name: "Canada",        flag: "🇨🇦", currency: "CAD", symbol: "CA$",  locale: "fr-CA" },
];

export function CurrencyProvider({ children }) {
  // Si l'utilisateur a déjà choisi manuellement, on respecte son choix
  const savedCurrency = localStorage.getItem("vit_currency");
  const [currencyCode, setCurrencyState] = useState(savedCurrency || "XOF");
  const [detectedCountry, setDetectedCountry] = useState(null);
  const [detecting, setDetecting] = useState(!savedCurrency);

  // Auto-détection par IP uniquement si aucun choix manuel enregistré
  useEffect(() => {
    if (savedCurrency) return;
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        const countryCode = data.country_code || "CI";
        const detectedCurrency = COUNTRY_TO_CURRENCY[countryCode] || "XOF";
        setDetectedCountry(countryCode);
        setCurrencyState(detectedCurrency);
      })
      .catch(() => {
        // Fallback silencieux → reste sur XOF
      })
      .finally(() => setDetecting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentCurrency =
    CURRENCIES.find((c) => c.code === currencyCode) || CURRENCIES[0];

  /**
   * Permet à l'utilisateur de choisir manuellement sa devise.
   * Ce choix est persisté dans localStorage.
   */
  const setCurrency = useCallback((code) => {
    setCurrencyState(code);
    localStorage.setItem("vit_currency", code);
  }, []);

  /**
   * Convertit un montant XOF vers la devise active
   */
  const convert = useCallback(
    (amountXOF) => {
      const rate = EXCHANGE_RATES[currentCurrency.code];
      if (!rate || rate === 1) return amountXOF;
      return Math.round((amountXOF / rate) * 100) / 100;
    },
    [currentCurrency]
  );

  /**
   * Formate un montant XOF dans la devise active
   *   fmt(150000) → "229 €" (France), "150 000 FCFA" (CI), "250 DH" (Maroc)
   */
  const fmt = useCallback(
    (amountXOF) => {
      if (amountXOF == null || isNaN(amountXOF)) return "—";
      const converted = convert(amountXOF);
      const { code, locale, symbol } = currentCurrency;

      if (["EUR", "USD", "CAD", "CHF", "GBP"].includes(code)) {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: code,
          maximumFractionDigits: 0,
        }).format(converted);
      }
      return `${Number(converted).toLocaleString(locale)} ${symbol}`;
    },
    [convert, currentCurrency]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currencyCode,
        currentCurrency,
        setCurrency,
        convert,
        fmt,
        detecting,
        detectedCountry,
        CURRENCIES,
        EXCHANGE_RATES,
        // rétrocompat
        countryCode: detectedCountry || "CI",
        COUNTRIES_CONFIG,
        setCountry: (countryCode) => {
          const c = COUNTRY_TO_CURRENCY[countryCode];
          if (c) setCurrency(c);
        },
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}

export default CurrencyContext;
