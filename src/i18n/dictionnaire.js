// Dictionnaires chargés, par langue (voir vite.i18n.js). L'application ne
// charge que la langue du visiteur, avant le premier rendu (main.jsx) ; les
// tests chargent les cinq (src/test/setup.js). Une langue absente retombe sur
// le français, puis sur la clé elle-même.
const CHARGEURS = {
  fr: () => import("virtual:i18n/fr"),
  en: () => import("virtual:i18n/en"),
  ar: () => import("virtual:i18n/ar"),
  es: () => import("virtual:i18n/es"),
  zh: () => import("virtual:i18n/zh"),
};

const charges = {};

export async function chargerDictionnaire(code) {
  const chargeur = CHARGEURS[code] || CHARGEURS.fr;
  const cle = CHARGEURS[code] ? code : "fr";
  if (!charges[cle]) charges[cle] = (await chargeur()).default;
  return charges[cle];
}

// Sans code : le dictionnaire chargé (l'application n'en charge qu'un — pour un
// visiteur anglophone, le français n'est jamais téléchargé).
export function dictionnaire(code) {
  return charges[code] || charges.fr || Object.values(charges)[0] || {};
}
