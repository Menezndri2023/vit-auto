import { createContext, useContext, useState, useCallback } from "react";
import translations from "../i18n/translations";

const I18nContext = createContext(null);

export const SUPPORTED_LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "en", label: "English",  flag: "🇬🇧", dir: "ltr" },
  { code: "ar", label: "العربية",  flag: "🇸🇦", dir: "rtl" },
  { code: "es", label: "Español",  flag: "🇪🇸", dir: "ltr" },
  { code: "zh", label: "中文",      flag: "🇨🇳", dir: "ltr" },
];

// Mapping code langue navigateur → code supporté
const LANG_MAP = {
  // Français
  fr: "fr", "fr-FR": "fr", "fr-CI": "fr", "fr-MA": "fr", "fr-BE": "fr",
  "fr-CA": "fr", "fr-SN": "fr", "fr-DZ": "fr", "fr-TN": "fr", "fr-CH": "fr",
  "fr-BF": "fr", "fr-ML": "fr", "fr-GN": "fr",
  // Anglais
  en: "en", "en-US": "en", "en-GB": "en", "en-AU": "en", "en-CA": "en",
  "en-GH": "en", "en-NG": "en", "en-ZA": "en",
  // Arabe
  ar: "ar", "ar-MA": "ar", "ar-DZ": "ar", "ar-TN": "ar", "ar-SA": "ar",
  "ar-EG": "ar", "ar-AE": "ar", "ar-MR": "ar",
  // Espagnol
  es: "es", "es-ES": "es", "es-MX": "es", "es-AR": "es", "es-CO": "es",
  "es-PE": "es", "es-VE": "es", "es-CL": "es",
  // Chinois
  zh: "zh", "zh-CN": "zh", "zh-TW": "zh", "zh-HK": "zh", "zh-SG": "zh",
};

/**
 * Détecte la langue depuis navigator.language.
 * Ordre de priorité : exact → préfixe → fallback "fr"
 */
function detectLang() {
  const nav = navigator.language || navigator.languages?.[0] || "fr";
  return LANG_MAP[nav] || LANG_MAP[nav.split("-")[0]] || "fr";
}

export function I18nProvider({ children }) {
  const saved = localStorage.getItem("vit_lang");
  const [lang, setLangState] = useState(saved || detectLang());

  const applyLang = useCallback((code) => {
    const dir = SUPPORTED_LANGS.find((l) => l.code === code)?.dir || "ltr";
    document.documentElement.setAttribute("dir",  dir);
    document.documentElement.setAttribute("lang", code);
  }, []);

  // Initialise dir/lang HTML au montage
  applyLang(lang);

  const setLang = useCallback((code) => {
    setLangState(code);
    localStorage.setItem("vit_lang", code);
    applyLang(code);
  }, [applyLang]);

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
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t, SUPPORTED_LANGS }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export default I18nContext;
