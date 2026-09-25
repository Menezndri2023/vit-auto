import { createContext, useContext, useState, useCallback, useMemo } from "react";
import translations from "../i18n/translations";
import {
  LANGUES, CODES, LANGUE_DEFAUT, langueDuChemin, cheminDansLangue,
} from "../i18n/langueUrl";

const I18nContext = createContext(null);

// Conservé pour les composants qui l'importaient déjà (LanguageSelector).
// La liste elle-même vit désormais dans i18n/langueUrl.js, avec les règles
// d'adressage : la langue et son URL ne doivent pas pouvoir diverger.
export const SUPPORTED_LANGS = LANGUES;

// Codes navigateur → codes supportés. Sert UNIQUEMENT à proposer une bascule
// (voir components/BandeauLangue) ; plus à choisir la langue rendue.
const LANG_MAP = {
  fr: "fr", "fr-FR": "fr", "fr-CI": "fr", "fr-MA": "fr", "fr-BE": "fr",
  "fr-CA": "fr", "fr-SN": "fr", "fr-DZ": "fr", "fr-TN": "fr", "fr-CH": "fr",
  "fr-BF": "fr", "fr-ML": "fr", "fr-GN": "fr",
  en: "en", "en-US": "en", "en-GB": "en", "en-AU": "en", "en-CA": "en",
  "en-GH": "en", "en-NG": "en", "en-ZA": "en",
  ar: "ar", "ar-MA": "ar", "ar-DZ": "ar", "ar-TN": "ar", "ar-SA": "ar",
  "ar-EG": "ar", "ar-AE": "ar", "ar-MR": "ar",
  es: "es", "es-ES": "es", "es-MX": "es", "es-AR": "es", "es-CO": "es",
  "es-PE": "es", "es-VE": "es", "es-CL": "es",
  zh: "zh", "zh-CN": "zh", "zh-TW": "zh", "zh-HK": "zh", "zh-SG": "zh",
};

/** Langue devinée du navigateur, ou null si elle n'est pas supportée. */
export function langueDuNavigateur() {
  if (typeof navigator === "undefined") return null;
  const nav = navigator.language || navigator.languages?.[0] || "";
  return LANG_MAP[nav] || LANG_MAP[nav.split("-")[0]] || null;
}

// ── Quelle langue rendre ? ──────────────────────────────────────────────────
//
// 1. Le préfixe de l'adresse, s'il y en a un. Il l'emporte sur tout : une
//    adresse doit rendre la même page pour tout le monde, robot compris.
// 2. Sinon, la préférence que le visiteur a EXPLICITEMENT choisie au sélecteur.
// 3. Sinon le français.
//
// `navigator.language` ne décide plus (il décidait jusqu'au 2026-09-25). Un
// robot annonce `en-US` : il rendait donc une page anglaise à une adresse que
// le sitemap et le canonical déclarent française. C'était précisément le
// désaccord que `hreflang` est censé lever. La détection sert maintenant à
// PROPOSER l'autre version, pas à l'imposer.
function langueInitiale() {
  const duChemin = langueDuChemin(window.location.pathname);
  if (duChemin) return duChemin;
  try {
    const memorise = localStorage.getItem("vit_lang");
    if (memorise && CODES.includes(memorise)) return memorise;
  } catch { /* stockage indisponible — français */ }
  return LANGUE_DEFAUT;
}

export function I18nProvider({ children }) {
  const [lang] = useState(langueInitiale);

  // dir/lang sur <html> : posés au premier rendu, et une seule fois — la
  // langue ne change plus sans changer d'adresse, donc sans recharger.
  const infos = useMemo(
    () => LANGUES.find((l) => l.code === lang) || LANGUES[0],
    [lang],
  );
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("dir", infos.dir);
    document.documentElement.setAttribute("lang", infos.htmlLang);
  }

  // Changer de langue, c'est changer d'adresse. Rechargement assumé : la base
  // du routeur (`basename`) est figée à sa création, la contourner en place
  // demanderait de remonter tout l'arbre. Une bascule de langue est rare.
  const setLang = useCallback((code) => {
    if (!CODES.includes(code) || code === lang) return;
    try { localStorage.setItem("vit_lang", code); } catch { /* ignore */ }
    const cible = cheminDansLangue(window.location.pathname, code);
    window.location.assign(cible + window.location.search + window.location.hash);
  }, [lang]);

  // params (optionnel) : interpolation simple `{nom}` — nécessaire pour les
  // clés qui embarquent une valeur dynamique (nombre de jours, prix, nom de
  // véhicule...). Rétrocompatible : t("key") sans params fonctionne comme avant.
  const t = useCallback(
    (key, params) => {
      const entry = translations[key];
      let str = entry ? (entry[lang] || entry["fr"] || key) : key;
      if (params) {
        str = str.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? params[name] : match));
      }
      return str;
    },
    [lang],
  );

  const valeur = useMemo(
    () => ({ lang, setLang, t, dir: infos.dir, SUPPORTED_LANGS: LANGUES }),
    [lang, setLang, t, infos.dir],
  );

  return <I18nContext.Provider value={valeur}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export default I18nContext;
