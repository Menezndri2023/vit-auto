// ── La langue vit dans l'adresse ────────────────────────────────────────────
//
// Avant le 2026-09-25, la langue n'existait que dans `localStorage` et dans
// `navigator.language`. Une seule adresse servait donc cinq langues, ce qui
// interdit tout balisage `hreflang` : Google exige une adresse DISTINCTE par
// version linguistique, et ignore purement et simplement un jeu d'alternates
// qui pointe cinq fois la même URL.
//
// Le choix retenu — préfixe de chemin, le français sans préfixe :
//
//     /catalogue        français   (et x-default)
//     /en/catalogue     anglais
//     /ar/catalogue     arabe
//     /es/catalogue     espagnol
//     /zh/catalogue     chinois
//
// Le français reste NU pour ne pas invalider les 643 adresses déjà indexées et
// les liens déjà partagés sur WhatsApp. `/fr/...` est redirigé vers la forme
// nue (voir `redirigerPrefixeFrancais`) : deux adresses pour une même page
// française seraient du contenu dupliqué.
//
// Le préfixe l'emporte TOUJOURS sur la préférence enregistrée. Sans lui, une
// adresse nue visitée par un robot — qui n'a ni `localStorage` ni préférence —
// rend du français, exactement ce que le sitemap et le canonical déclarent.

export const LANGUE_DEFAUT = "fr";

export const LANGUES = [
  { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr", htmlLang: "fr" },
  { code: "en", label: "English",  flag: "🇬🇧", dir: "ltr", htmlLang: "en" },
  { code: "ar", label: "العربية",  flag: "🇸🇦", dir: "rtl", htmlLang: "ar" },
  { code: "es", label: "Español",  flag: "🇪🇸", dir: "ltr", htmlLang: "es" },
  { code: "zh", label: "中文",      flag: "🇨🇳", dir: "ltr", htmlLang: "zh-Hans" },
];

export const CODES = LANGUES.map((l) => l.code);

// Les langues qui prennent un préfixe : toutes sauf le français.
export const CODES_PREFIXES = CODES.filter((c) => c !== LANGUE_DEFAUT);

/**
 * Langue portée par le chemin, ou null si le chemin est nu.
 * `/en/catalogue` → "en" ; `/catalogue` → null ; `/english` → null (le
 * segment doit être EXACTEMENT un code, pas un préfixe de mot).
 */
export function langueDuChemin(pathname = "/") {
  const segment = String(pathname).split("/")[1];
  return CODES_PREFIXES.includes(segment) ? segment : null;
}

/**
 * Base à donner au routeur : "/en" pour une adresse préfixée, "" sinon.
 * React Router préfixe alors tous les liens internes tout seul — aucun
 * `<Link>` de l'application n'a eu à être modifié.
 */
export function baseRouteur(pathname = "/") {
  const code = langueDuChemin(pathname);
  return code ? `/${code}` : "";
}

/** `/en/catalogue` → `/catalogue`. Le chemin nu, celui des routes déclarées. */
export function cheminNu(pathname = "/") {
  const code = langueDuChemin(pathname);
  if (!code) return pathname || "/";
  const reste = pathname.slice(code.length + 1);
  return reste || "/";
}

/** `/catalogue` + "ar" → `/ar/catalogue`. Le français reste nu. */
export function cheminDansLangue(pathname = "/", code = LANGUE_DEFAUT) {
  const nu = cheminNu(pathname);
  if (code === LANGUE_DEFAUT) return nu;
  return nu === "/" ? `/${code}` : `/${code}${nu}`;
}

/**
 * `/fr/...` n'est pas une adresse légitime : elle doublonnerait la forme nue.
 * Appelé avant le montage de React, il remplace l'entrée d'historique — le
 * visiteur ne voit pas d'aller-retour et le bouton « retour » reste propre.
 * Renvoie true si une redirection a été déclenchée.
 */
export function redirigerPrefixeFrancais(location = window.location) {
  const p = location.pathname || "/";
  if (p !== `/${LANGUE_DEFAUT}` && !p.startsWith(`/${LANGUE_DEFAUT}/`)) return false;
  const nu = p.slice(LANGUE_DEFAUT.length + 1) || "/";
  location.replace(nu + (location.search || "") + (location.hash || ""));
  return true;
}
