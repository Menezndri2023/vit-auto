import { createContext, useContext, useState, useCallback, useEffect } from "react";

const CurrencyContext = createContext(null);

// ─── Taux de conversion base MAD (dirham marocain = devise primaire) ────────────
// 1 MAD vaut N unités de la devise cible
export const EXCHANGE_RATES_FROM_MAD = {
  MAD: 1,
  XOF: 60.5,      // 1 MAD ≈ 60.5 FCFA
  EUR: 0.0916,    // 1 MAD ≈ 0.092 €
  USD: 0.100,     // 1 MAD ≈ 0.10 $
  GBP: 0.0793,    // 1 MAD ≈ 0.079 £
  CAD: 0.136,
  CHF: 0.0903,
  TND: 0.310,
  DZD: 13.5,
  GNF: 927,
};

// Taux de conversion XOF → devise (pour rétrocompat avec fmt(amountXOF))
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

// Correspondance pays → devise
const COUNTRY_TO_CURRENCY = {
  MA: "MAD",                                        // Maroc — devise primaire
  CI: "XOF", SN: "XOF", ML: "XOF", BF: "XOF",
  NE: "XOF", TG: "XOF", BJ: "XOF", CM: "XOF",
  GN: "GNF",
  DZ: "DZD",
  TN: "TND",
  FR: "EUR", BE: "EUR", ES: "EUR", PT: "EUR",
  IT: "EUR", DE: "EUR", NL: "EUR", LU: "EUR",
  CH: "CHF",
  GB: "GBP",
  US: "USD",
  CA: "CAD",
};

export const CURRENCIES = [
  { code: "MAD", symbol: "DH",   name: "Dirham marocain", flag: "🇲🇦", locale: "fr-MA" },
  { code: "XOF", symbol: "FCFA", name: "Franc CFA",       flag: "🌍",  locale: "fr-CI" },
  { code: "EUR", symbol: "€",    name: "Euro",             flag: "🇪🇺",  locale: "fr-FR" },
  { code: "USD", symbol: "$",    name: "Dollar US",        flag: "🇺🇸",  locale: "en-US" },
  { code: "GBP", symbol: "£",    name: "Livre sterling",   flag: "🇬🇧",  locale: "en-GB" },
  { code: "CAD", symbol: "CA$",  name: "Dollar canadien",  flag: "🇨🇦",  locale: "fr-CA" },
  { code: "CHF", symbol: "CHF",  name: "Franc suisse",     flag: "🇨🇭",  locale: "fr-CH" },
  { code: "TND", symbol: "DT",   name: "Dinar tunisien",   flag: "🇹🇳",  locale: "fr-TN" },
  { code: "DZD", symbol: "DA",   name: "Dinar algérien",   flag: "🇩🇿",  locale: "fr-DZ" },
];

export const COUNTRIES_CONFIG = [
  { code: "MA", name: "Maroc",         flag: "🇲🇦", currency: "MAD", symbol: "DH",   locale: "fr-MA" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", symbol: "FCFA", locale: "fr-CI" },
  { code: "SN", name: "Sénégal",       flag: "🇸🇳", currency: "XOF", symbol: "FCFA", locale: "fr-SN" },
  { code: "ML", name: "Mali",          flag: "🇲🇱", currency: "XOF", symbol: "FCFA", locale: "fr-ML" },
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
  const saved = localStorage.getItem("vit_currency");
  // Devise par défaut : MAD (Maroc — siège social)
  const [currencyCode, setCurrencyState] = useState(saved || "MAD");
  const [detectedCountry, setDetectedCountry] = useState(saved ? "MA" : null);
  const [detecting, setDetecting] = useState(!saved);

  // Auto-détection IP → devise si aucun choix manuel
  useEffect(() => {
    if (saved) { setDetecting(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    // Essai 1 : ipapi.co
    fetch("https://ipapi.co/json/", { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const cc = data.country_code || "MA";
        const cur = COUNTRY_TO_CURRENCY[cc] || "MAD";
        setDetectedCountry(cc);
        setCurrencyState(cur);
      })
      .catch(() => {
        // Essai 2 : ip-api.com (fallback)
        fetch("http://ip-api.com/json/?fields=countryCode", { signal: controller.signal })
          .then((r) => r.ok ? r.json() : Promise.reject())
          .then((data) => {
            const cc = data.countryCode || "MA";
            const cur = COUNTRY_TO_CURRENCY[cc] || "MAD";
            setDetectedCountry(cc);
            setCurrencyState(cur);
          })
          .catch(() => {
            // Fallback final : MAD (Maroc)
            setDetectedCountry("MA");
          });
      })
      .finally(() => { clearTimeout(timer); setDetecting(false); });

    return () => { controller.abort(); clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentCurrency = CURRENCIES.find((c) => c.code === currencyCode) || CURRENCIES[0];

  const setCurrency = useCallback((code) => {
    setCurrencyState(code);
    localStorage.setItem("vit_currency", code);
  }, []);

  // Convertit XOF → devise active (rétrocompat)
  const convert = useCallback(
    (amountXOF) => {
      const rate = EXCHANGE_RATES[currentCurrency.code];
      if (!rate || rate === 1) return amountXOF;
      return Math.round((amountXOF / rate) * 100) / 100;
    },
    [currentCurrency]
  );

  // Formate XOF dans la devise active
  const fmt = useCallback(
    (amountXOF) => {
      if (amountXOF == null || isNaN(amountXOF)) return "—";
      const converted = convert(amountXOF);
      const { code, locale, symbol } = currentCurrency;
      if (["EUR", "USD", "CAD", "CHF", "GBP"].includes(code)) {
        return new Intl.NumberFormat(locale, {
          style: "currency", currency: code, maximumFractionDigits: 0,
        }).format(converted);
      }
      return `${Number(converted).toLocaleString(locale)} ${symbol}`;
    },
    [convert, currentCurrency]
  );

  // Convertit MAD → devise active (pour Plans, commissions, prix en DH)
  const fmtFromMAD = useCallback(
    (amountMAD) => {
      if (amountMAD == null || isNaN(amountMAD)) return "—";
      if (amountMAD === 0) return "Gratuit";
      const { code, symbol, locale } = currentCurrency;
      const rate = EXCHANGE_RATES_FROM_MAD[code] ?? 1;
      const converted = Math.round(amountMAD * rate);
      if (["EUR", "USD", "CAD", "CHF", "GBP"].includes(code)) {
        return new Intl.NumberFormat(locale, {
          style: "currency", currency: code, maximumFractionDigits: 0,
        }).format(amountMAD * rate);
      }
      return `${Number(converted).toLocaleString(locale)} ${symbol}`;
    },
    [currentCurrency]
  );

  // Valeur brute MAD → XOF pour calculs
  const fromMAD = useCallback(
    (amountMAD) => Math.round(amountMAD * EXCHANGE_RATES.MAD),
    []
  );

  return (
    <CurrencyContext.Provider
      value={{
        currencyCode,
        currentCurrency,
        currency: currentCurrency,
        setCurrency,
        convert,
        fmt,
        fmtFromMAD,
        fromMAD,
        detecting,
        detectedCountry: detectedCountry || "MA",
        CURRENCIES,
        EXCHANGE_RATES,
        EXCHANGE_RATES_FROM_MAD,
        countryCode: detectedCountry || "MA",
        COUNTRIES_CONFIG,
        setCountry: (cc) => {
          const cur = COUNTRY_TO_CURRENCY[cc];
          if (cur) setCurrency(cur);
        },
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be inside CurrencyProvider");
  return ctx;
}

export default CurrencyContext;
