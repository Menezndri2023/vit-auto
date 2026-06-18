import { createContext, useContext, useState, useCallback } from "react";
import translations from "../i18n/translations";

const I18nContext = createContext(null);

export const SUPPORTED_LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "en", label: "English",  flag: "🇬🇧", dir: "ltr" },
  { code: "ar", label: "العربية",  flag: "🇸🇦", dir: "rtl" },
];

// Mapping code langue navigateur → code supporté
const LANG_MAP = {
  fr: "fr", "fr-FR": "fr", "fr-CI": "fr", "fr-MA": "fr", "fr-BE": "fr",
  "fr-CA": "fr", "fr-SN": "fr", "fr-DZ": "fr", "fr-TN": "fr",
  en: "en", "en-US": "en", "en-GB": "en", "en-AU": "en", "en-CA": "en",
  ar: "ar", "ar-MA": "ar", "ar-DZ": "ar", "ar-TN": "ar", "ar-SA": "ar",
  "ar-EG": "ar", "ar-AE": "ar",
};

/**
 * Détecte la langue depuis navigator.language (synchrone, pas de requête réseau).
 * Ex : "fr-FR" → "fr", "ar" → "ar", "es-ES" → "fr" (fallback)
 */
function detectLang() {
  const nav = navigator.language || navigator.languages?.[0] || "fr";
  // Essai exact, puis juste le préfixe "fr" de "fr-XX"
  return LANG_MAP[nav] || LANG_MAP[nav.split("-")[0]] || "fr";
}

export function I18nProvider({ children }) {
  const saved = localStorage.getItem("vit_lang");
  // Si aucun choix enregistré → détection automatique
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

  const t = useCallback(
    (key) => {
      const entry = translations[key];
      if (!entry) return key;
      return entry[lang] || entry["fr"] || key;
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
