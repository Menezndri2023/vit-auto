import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";

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
  CNY: 0.716,
};

// Taux de conversion XOF → devise (pour rétrocompat avec fmt(amountXOF))
// AED/GHS/NGN ajoutées pour les annonces Import/Export (voir CURRENCIES dans
// data/autocomplete.js, choix de devise du formulaire de publication) — sans
// ces taux, fmtFromCurrency() serait tombée à 1 (traitée comme du XOF), soit
// un prix affiché des centaines de fois trop faible pour ces devises.
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
  CNY: 84.5,
  AED: 163,
  GHS: 40,
  NGN: 0.4,
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
  CN: "CNY",
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
  { code: "CNY", symbol: "¥",    name: "Yuan chinois",     flag: "🇨🇳",  locale: "zh-CN" },
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
  { code: "CN", name: "Chine",         flag: "🇨🇳", currency: "CNY", symbol: "¥",    locale: "zh-CN" },
];

// Valeur spéciale (pas un vrai code pays ISO) pour "toutes les annonces, tous
// pays confondus" — utilisée par le sélecteur de catalogue, jamais stockée
// sur un utilisateur/une annonce.
export const COUNTRY_INTERNATIONAL = "INTL";

export function CurrencyProvider({ children }) {
  const { user } = useAuth();
  const saved = localStorage.getItem("vit_currency");
  // Devise par défaut : MAD (Maroc — siège social)
  const [currencyCode, setCurrencyState] = useState(saved || "MAD");
  const [detectedCountry, setDetectedCountry] = useState(saved ? "MA" : null);
  const [detecting, setDetecting] = useState(!saved);

  // ── Filtre pays du catalogue (véhicules, chauffeurs, import/export) ────────
  // Distinct de la devise : "International" affiche tout sans changer la
  // devise active. Par défaut, un utilisateur connecté voit le catalogue de
  // son propre pays déclaré au profil ; sinon, celui détecté par IP/enregistré.
  const savedCatalog = localStorage.getItem("vit_catalog_country");
  const [catalogCountry, setCatalogCountryState] = useState(savedCatalog || null);
  const catalogManuallySet = useRef(!!savedCatalog);

  const setCatalogCountry = useCallback((code) => {
    catalogManuallySet.current = true;
    setCatalogCountryState(code);
    localStorage.setItem("vit_catalog_country", code);
  }, []);

  // Le pays du profil (déclaré à l'inscription) prime sur la détection IP dès
  // qu'il est connu — mais seulement tant que l'utilisateur n'a pas choisi
  // explicitement un autre pays de catalogue via le sélecteur.
  useEffect(() => {
    if (catalogManuallySet.current) return;
    if (user?.country) setCatalogCountryState(user.country);
    else if (detectedCountry) setCatalogCountryState(detectedCountry);
  }, [user?.country, detectedCountry]);

  // Auto-détection pays → devise si aucun choix manuel. Priorité au endpoint
  // serveur (geoip-lite, base locale hors ligne, fiable et sans dépendance
  // réseau tierce) — l'ancienne approche 100% côté client (fetch direct vers
  // ipapi.co) échouait silencieusement dès qu'un bloqueur de pub, une politique
  // CORS ou le quota gratuit du service tiers intervenait, et retombait alors
  // TOUJOURS sur le Maroc par défaut, y compris pour des visiteurs d'Afrique
  // de l'Ouest (marché principal) — gardé uniquement en second repli.
  useEffect(() => {
    if (saved) { setDetecting(false); return; }
    let cancelled = false;

    const applyCountry = (cc) => {
      if (cancelled || !cc) return false;
      const cur = COUNTRY_TO_CURRENCY[cc] || "MAD";
      setDetectedCountry(cc);
      setCurrencyState(cur);
      return true;
    };

    (async () => {
      try {
        const r = await fetch("/api/geo/my-country");
        if (r.ok) {
          const d = await r.json();
          if (applyCountry(d.country)) { setDetecting(false); return; }
        }
      } catch { /* backend indisponible — repli ci-dessous */ }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch("https://ipapi.co/json/", { signal: controller.signal });
        if (r.ok) {
          const d = await r.json();
          applyCountry(d.country_code || "MA");
        } else {
          applyCountry("MA");
        }
      } catch {
        applyCountry("MA");
      } finally {
        clearTimeout(timer);
        if (!cancelled) setDetecting(false);
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Détection précise optionnelle via géolocalisation navigateur (GPS/Wi-Fi) —
  // complète la détection IP quand elle est disponible (ex : IP faussée par un
  // VPN/proxy mobile) ou lorsqu'un utilisateur veut explicitement affiner sa
  // position (bouton dédié, jamais déclenché automatiquement sans geste
  // utilisateur). Reverse-geocode via Nominatim, déjà utilisé ailleurs sur le
  // site (Booking.jsx, VendorSubmit.jsx) — aucune clé API supplémentaire.
  const detectPreciseCountry = useCallback(() => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve({ ok: false, message: "Géolocalisation non supportée par ce navigateur." }); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, { headers: { "Accept-Language": "fr" } });
            const d = await r.json();
            const cc = d?.address?.country_code?.toUpperCase();
            if (cc && COUNTRIES_CONFIG.some((c) => c.code === cc)) {
              const cur = COUNTRY_TO_CURRENCY[cc] || "MAD";
              setDetectedCountry(cc);
              setCurrencyState(cur);
              catalogManuallySet.current = true;
              setCatalogCountryState(cc);
              localStorage.setItem("vit_catalog_country", cc);
              resolve({ ok: true, country: cc });
            } else {
              resolve({ ok: false, message: "Pays non reconnu ou non couvert par VIT AUTO." });
            }
          } catch {
            resolve({ ok: false, message: "Impossible de déterminer le pays depuis votre position." });
          }
        },
        (err) => resolve({ ok: false, message: err.code === 1 ? "Accès à la position refusé." : "Position indisponible." }),
        { enableHighAccuracy: false, timeout: 10000 }
      );
    });
  }, []);

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

  // Formate un montant déjà exprimé dans une devise arbitraire (annonces
  // Import/Export : le partenaire choisit librement la devise de son annonce,
  // ex. EUR/USD/AED — jamais XOF) dans la devise active du visiteur (détectée
  // par IP). Repasse par XOF comme pivot, comme fmt().
  const fmtFromCurrency = useCallback(
    (amount, sourceCode) => {
      if (amount == null || isNaN(amount)) return "—";
      const sourceRate = EXCHANGE_RATES[sourceCode] ?? 1;
      return fmt(amount * sourceRate);
    },
    [fmt]
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
        fmtFromCurrency,
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
        catalogCountry: catalogCountry || detectedCountry || "MA",
        setCatalogCountry,
        detectPreciseCountry,
        COUNTRY_INTERNATIONAL,
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
