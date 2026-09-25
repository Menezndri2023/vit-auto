// ── Les langues du site, côté serveur ───────────────────────────────────────
//
// Doit rester identique à src/i18n/langueUrl.js : le sitemap annonce aux
// moteurs des adresses que l'application doit savoir résoudre. Une divergence
// publierait des URL mortes — exactement le défaut que le sitemap servi par
// l'API vient de corriger. Un test compare les deux listes
// (server/tests/sitemap.test.js).

export const LANGUE_DEFAUT = "fr";

// Le code tel qu'il apparaît dans l'adresse, et celui attendu par `hreflang`
// (« zh-Hans » et non « zh » : c'est du chinois simplifié).
export const LANGUES = [
  { code: "fr", hreflang: "fr" },
  { code: "en", hreflang: "en" },
  { code: "ar", hreflang: "ar" },
  { code: "es", hreflang: "es" },
  { code: "zh", hreflang: "zh-Hans" },
];

/** `/catalogue` + "ar" → `/ar/catalogue`. Le français reste sans préfixe. */
export function cheminDansLangue(chemin, code) {
  if (code === LANGUE_DEFAUT) return chemin;
  return chemin === "/" ? `/${code}` : `/${code}${chemin}`;
}
