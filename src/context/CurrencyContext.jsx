import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { getCurrentPosition } from "../utils/geo.js";

const CurrencyContext = createContext(null);

// ─── Source de vérité : /api/pricing/currencies + /api/pricing/countries ────
// (server/models/ExchangeRate.js + CountryConfig.js, éditables admin) — plus
// aucun taux/pays codé en dur ici. Utilisé uniquement si le fetch échoue au
// tout premier chargement (backend indisponible) pour éviter un écran cassé ;
// remplacé dès que la vraie réponse arrive.
const FALLBACK_CURRENCIES = [
  { code: "MAD", symbol: "DH",   name: "Dirham marocain", rateFromUSD: 9.9174 },
  { code: "XOF", symbol: "FCFA", name: "Franc CFA",       rateFromUSD: 600 },
  { code: "EUR", symbol: "€",    name: "Euro",             rateFromUSD: 0.9147 },
  { code: "USD", symbol: "$",    name: "Dollar US",        rateFromUSD: 1 },
];
const FALLBACK_COUNTRIES = [
  { code: "MA", name: "Maroc",         flag: "🇲🇦", currency: "MAD", locale: "fr-MA" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", locale: "fr-CI" },
];

// Valeur spéciale (pas un vrai code pays ISO) pour "toutes les annonces, tous
// pays confondus" — utilisée par le sélecteur de catalogue, jamais stockée
// sur un utilisateur/une annonce.
export const COUNTRY_INTERNATIONAL = "INTL";

const INTL_CODES = ["EUR", "USD", "CAD", "CHF", "GBP"];

export function CurrencyProvider({ children }) {
  const { user } = useAuth();
  const saved = localStorage.getItem("vit_currency");
  // Distingue un choix EXPLICITE (futur sélecteur manuel, voir setCurrency)
  // d'une simple valeur mise en cache par la détection automatique — bug réel
  // corrigé (audit) : `saved` seul servait à la fois de cache d'affichage ET
  // de verrou empêchant TOUTE re-détection IP future, y compris quand la
  // valeur ne vient que d'une détection automatique passée (jamais d'un choix
  // utilisateur réel, puisqu'aucun sélecteur de devise n'existe encore dans
  // l'UI). Résultat : une détection IP erronée une seule fois (VPN, proxy,
  // base geoip-lite imprécise ce jour-là) restait bloquée indéfiniment sur ce
  // navigateur, donnant l'impression que "la devise par IP ne fonctionne pas"
  // alors que le mécanisme lui-même était sain.
  const isManualChoice = localStorage.getItem("vit_currency_manual") === "true";
  // Devise par défaut : USD — tant que la géolocalisation (IP/GPS) n'a pas
  // répondu, et repli final si elle échoue totalement (voir effet de
  // détection ci-dessous, qui ne bascule plus sur MAD/Maroc en cas d'échec).
  // `saved` sert uniquement à éviter un flash "USD" à l'affichage initial
  // pour un visiteur déjà détecté par le passé — jamais à bloquer une
  // nouvelle détection (voir isManualChoice ci-dessus).
  const [currencyCode, setCurrencyState] = useState(saved || "USD");
  const [detectedCountry, setDetectedCountry] = useState(null);
  const [detecting, setDetecting] = useState(!saved);

  // ── Référentiels devises/pays, chargés une fois au montage ────────────────
  const [currencies, setCurrencies] = useState(FALLBACK_CURRENCIES);
  const [countriesConfig, setCountriesConfig] = useState(FALLBACK_COUNTRIES);

  useEffect(() => {
    (async () => {
      try {
        const [rCur, rCountries] = await Promise.all([
          fetch("/api/pricing/currencies"),
          fetch("/api/pricing/countries"),
        ]);
        if (rCur.ok) {
          const d = await rCur.json();
          if (Array.isArray(d.currencies) && d.currencies.length) setCurrencies(d.currencies);
        }
        if (rCountries.ok) {
          const d = await rCountries.json();
          if (Array.isArray(d.countries) && d.countries.length) setCountriesConfig(d.countries);
        }
      } catch {
        // Backend indisponible au chargement — les tables de repli restent actives.
      }
    })();
  }, []);

  // Taux (unités de `code` pour 1 USD) — table dérivée du fetch, jamais en dur.
  const rateFromUSD = useCallback(
    (code) => currencies.find((c) => c.code === code)?.rateFromUSD ?? 1,
    [currencies]
  );

  const COUNTRY_TO_CURRENCY = Object.fromEntries(countriesConfig.map((c) => [c.code, c.currency]));

  // CURRENCIES (liste pour le sélecteur) — flag/locale hérités du premier pays
  // trouvé utilisant cette devise (info de présentation, pas une règle commerciale).
  const CURRENCIES = currencies.map((c) => {
    const country = countriesConfig.find((co) => co.currency === c.code);
    return { code: c.code, symbol: c.symbol, name: c.name, flag: country?.flag || "🌍", locale: country?.locale || "fr-FR" };
  });

  const COUNTRIES_CONFIG = countriesConfig.map((c) => ({
    code: c.code, name: c.name, flag: c.flag, currency: c.currency,
    symbol: currencies.find((cur) => cur.code === c.currency)?.symbol || c.currency,
    locale: c.locale,
    // Moyens de paiement activés par l'admin pour ce pays (CountryConfig.paymentMethods,
    // voir AdminPanel.jsx) — jusqu'ici récupéré du backend mais jamais exposé au
    // reste du front, qui affichait toujours TOUS les moyens de paiement en dur
    // quel que soit le pays. Un tableau vide = pays pas encore configuré : aucune
    // restriction (voir getPaymentMethodsForCountry ci-dessous), jamais "aucun moyen".
    paymentMethods: Array.isArray(c.paymentMethods) ? c.paymentMethods : [],
  }));

  // Liste des moyens de paiement activés pour un pays — repli sur "aucune
  // restriction" (null) si le pays est inconnu ou pas encore configuré, pour
  // ne jamais casser le paiement d'un pays que l'admin n'a pas encore renseigné.
  const getPaymentMethodsForCountry = useCallback((countryCode) => {
    const cfg = COUNTRIES_CONFIG.find((c) => c.code === countryCode);
    return cfg?.paymentMethods?.length ? cfg.paymentMethods : null;
  }, [COUNTRIES_CONFIG]);

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
  // de l'Ouest (marché principal). Gardé uniquement en second repli.
  useEffect(() => {
    // Seul un choix EXPLICITE (isManualChoice) empêche la re-détection —
    // une valeur simplement mise en cache par une détection automatique
    // précédente ne doit jamais bloquer une nouvelle tentative à chaque
    // chargement (voir commentaire sur isManualChoice plus haut).
    if (isManualChoice) { setDetecting(false); return; }
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
          // Si même ce repli ne renvoie rien d'exploitable, on reste sur le
          // défaut USD plutôt que de forcer un pays — voir décision produit :
          // pas de biais Maroc pour un visiteur non localisable.
          if (d.country_code) applyCountry(d.country_code);
        }
      } catch {
        // Géolocalisation totalement indisponible — on reste sur USD par défaut.
      } finally {
        clearTimeout(timer);
        if (!cancelled) setDetecting(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countriesConfig]);

  // Détection précise optionnelle via géolocalisation navigateur (GPS/Wi-Fi) —
  // complète la détection IP quand elle est disponible (ex : IP faussée par un
  // VPN/proxy mobile) ou lorsqu'un utilisateur veut explicitement affiner sa
  // position (bouton dédié, jamais déclenché automatiquement sans geste
  // utilisateur). Reverse-geocode via Nominatim, déjà utilisé ailleurs sur le
  // site (Booking.jsx, VendorSubmit.jsx) — aucune clé API supplémentaire.
  const detectPreciseCountry = useCallback(() => {
    return new Promise((resolve) => {
      getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, { headers: { "Accept-Language": "fr" } });
            const d = await r.json();
            const cc = d?.address?.country_code?.toUpperCase();
            if (cc && countriesConfig.some((c) => c.code === cc)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countriesConfig]);

  const currentCurrency = CURRENCIES.find((c) => c.code === currencyCode) || CURRENCIES[0];

  const setCurrency = useCallback((code) => {
    setCurrencyState(code);
    localStorage.setItem("vit_currency", code);
  }, []);

  // Formate un montant déjà en USD — formateur canonique pour toute nouvelle
  // donnée (PricingConfig, et progressivement Vehicle/Booking après migration).
  const fmtUSD = useCallback(
    (amountUSD) => {
      if (amountUSD == null || isNaN(amountUSD)) return "—";
      const { code, locale, symbol } = currentCurrency;
      const converted = code === "USD" ? amountUSD : amountUSD * rateFromUSD(code);
      if (INTL_CODES.includes(code)) {
        return new Intl.NumberFormat(locale, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(converted);
      }
      return `${Number(Math.round(converted * 100) / 100).toLocaleString(locale)} ${symbol}`;
    },
    [currentCurrency, rateFromUSD]
  );

  // Convertit XOF → devise active (rétrocompat — XOF reste le pivot historique
  // de Vehicle/Booking tant que la Phase 2 de la refonte n'a pas migré leur
  // stockage vers USD ; passe par USD en interne).
  const convert = useCallback(
    (amountXOF) => {
      if (amountXOF == null || isNaN(amountXOF)) return amountXOF;
      const amountUSD = amountXOF / rateFromUSD("XOF");
      const targetRate = rateFromUSD(currentCurrency.code);
      if (currentCurrency.code === "XOF") return amountXOF;
      return Math.round(amountUSD * targetRate * 100) / 100;
    },
    [currentCurrency, rateFromUSD]
  );

  // `fmt` = alias de `fmtUSD` — depuis la Phase 2 de la refonte (migration
  // Vehicle/Booking/Driver vers un stockage 100% USD, voir
  // server/scripts/migrate-vehicle-booking-to-usd.mjs), les ~90 points d'appel
  // existants de fmt() dans l'app formatent tous des champs désormais en USD
  // (pricePerDay, montantTotal, commissionAmount, tarif...). Garder le nom
  // historique évite de toucher chacun de ces call sites individuellement ;
  // `convert()` ci-dessus reste l'ancien pivot XOF, non utilisé ici, conservé
  // pour compat si un appelant externe en dépend encore.
  const fmt = fmtUSD;

  // Formate un montant déjà exprimé dans une devise arbitraire (annonces
  // Import/Export : le partenaire choisit librement la devise de son annonce,
  // ex. EUR/USD/AED — jamais XOF) dans la devise active du visiteur (détectée
  // par IP). Repasse par XOF comme pivot, comme fmt().
  const fmtFromCurrency = useCallback(
    (amount, sourceCode) => {
      if (amount == null || isNaN(amount)) return "—";
      const sourceRateXOF = rateFromUSD("XOF") / (rateFromUSD(sourceCode) || 1); // XOF pour 1 unité de sourceCode
      return fmt(amount * sourceRateXOF);
    },
    [fmt, rateFromUSD]
  );

  // Formate un montant tel quel (aucune conversion) dans une devise donnée —
  // sert de "valeur réelle" pour l'affichage double ci-dessous (ex. le prix
  // d'origine saisi par le partenaire, à côté du prix converti pour le
  // visiteur).
  const formatLiteral = useCallback(
    (amount, code) => {
      if (amount == null || isNaN(amount)) return "—";
      const meta = CURRENCIES.find((c) => c.code === code);
      const locale = meta?.locale || "fr-FR";
      const symbol = meta?.symbol || code;
      if (INTL_CODES.includes(code)) {
        return new Intl.NumberFormat(locale, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount);
      }
      return `${Number(Math.round(amount * 100) / 100).toLocaleString(locale)} ${symbol}`;
    },
    [CURRENCIES]
  );

  // Affichage double géolocalisé : prix converti dans la devise active du
  // visiteur (détectée par IP/GPS) + prix réel (celui réellement stocké/facturé,
  // toujours en USD pour Vehicle/Booking). `secondary` est null quand les deux
  // devises coïncident (rien à ajouter). Retourne un objet {primary, secondary}
  // pour laisser chaque composant styliser le prix réel en plus petit/discret.
  const fmtDual = useCallback(
    (amountUSD) => {
      if (amountUSD == null || isNaN(amountUSD)) return { primary: "—", secondary: null };
      const primary = fmtUSD(amountUSD);
      if (currentCurrency.code === "USD") return { primary, secondary: null };
      return { primary, secondary: formatLiteral(amountUSD, "USD") };
    },
    [fmtUSD, currentCurrency, formatLiteral]
  );

  // Même principe que fmtDual, mais pour un montant stocké dans une devise
  // arbitraire choisie par le partenaire (annonces Import/Export) plutôt
  // qu'en USD — le "réel" est alors la devise d'origine de l'annonce.
  const fmtFromCurrencyDual = useCallback(
    (amount, sourceCode) => {
      if (amount == null || isNaN(amount)) return { primary: "—", secondary: null };
      const primary = fmtFromCurrency(amount, sourceCode);
      if (currentCurrency.code === sourceCode) return { primary, secondary: null };
      return { primary, secondary: formatLiteral(amount, sourceCode) };
    },
    [fmtFromCurrency, currentCurrency, formatLiteral]
  );

  // Convertit MAD → devise active (pour Plans, commissions)
  const fmtFromMAD = useCallback(
    (amountMAD) => {
      if (amountMAD == null || isNaN(amountMAD)) return "—";
      if (amountMAD === 0) return "Gratuit";
      const { code, symbol, locale } = currentCurrency;
      const converted = amountMAD * (rateFromUSD(code) / rateFromUSD("MAD"));
      if (INTL_CODES.includes(code)) {
        return new Intl.NumberFormat(locale, {
          style: "currency", currency: code, maximumFractionDigits: 0,
        }).format(converted);
      }
      return `${Number(Math.round(converted)).toLocaleString(locale)} ${symbol}`;
    },
    [currentCurrency, rateFromUSD]
  );

  // Valeur brute MAD → XOF pour calculs
  const fromMAD = useCallback(
    (amountMAD) => Math.round(amountMAD * (rateFromUSD("XOF") / rateFromUSD("MAD"))),
    [rateFromUSD]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currencyCode,
        currentCurrency,
        currency: currentCurrency,
        setCurrency,
        rateFromUSD,
        convert,
        fmt,
        fmtUSD,
        fmtFromCurrency,
        fmtDual,
        fmtFromCurrencyDual,
        fmtFromMAD,
        fromMAD,
        detecting,
        detectedCountry: detectedCountry || "MA",
        CURRENCIES,
        EXCHANGE_RATES: Object.fromEntries(currencies.map((c) => [c.code, rateFromUSD("XOF") / c.rateFromUSD])),
        EXCHANGE_RATES_FROM_MAD: Object.fromEntries(currencies.map((c) => [c.code, c.rateFromUSD / rateFromUSD("MAD")])),
        countryCode: detectedCountry || "MA",
        COUNTRIES_CONFIG,
        getPaymentMethodsForCountry,
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
