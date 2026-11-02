// Dictionnaires par langue (2026-11-02).
//
// Les 2 150 clés de src/i18n (≈ 413 Ko pour les cinq langues) étaient toutes
// dans le paquet principal, téléchargé par chaque visiteur avant le premier
// affichage. Ce plugin expose `virtual:i18n/<code>` : à la construction, un
// module par langue, ne contenant que ses chaînes (repli sur le français déjà
// appliqué). La source de vérité reste src/i18n/*.js — rien à synchroniser.
//
// En développement et sous vitest, le module recalcule depuis les sources à
// chaque chargement (modification d'un fichier de traduction prise en compte
// par le rechargement à chaud).
import { pathToFileURL, fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const PREFIXE = "virtual:i18n/";
const RACINE = fileURLToPath(new URL("./src/i18n/", import.meta.url));
const SOURCE = join(RACINE, "translations.js");

export const extraire = (toutes, code) =>
  Object.fromEntries(Object.entries(toutes).map(([cle, v]) => [cle, v[code] || v.fr || null]));

export default function i18nParLangue() {
  let construction = false;
  return {
    name: "vit-auto-i18n-par-langue",
    configResolved(config) { construction = config.command === "build"; },
    resolveId(id) { return id.startsWith(PREFIXE) ? "\0" + id : null; },
    async load(id) {
      if (!id.startsWith("\0" + PREFIXE)) return null;
      const code = id.slice(("\0" + PREFIXE).length);
      if (!/^[a-z]{2}$/.test(code)) this.error(`langue invalide : ${code}`);
      if (!construction) {
        // Module ordinaire du graphe Vite : suivi et rechargé à chaud.
        return `import toutes from ${JSON.stringify("/src/i18n/translations.js")};
export default Object.fromEntries(Object.entries(toutes).map(([k, v]) => [k, v[${JSON.stringify(code)}] || v.fr || null]));`;
      }
      for (const f of readdirSync(RACINE)) if (f.endsWith(".js")) this.addWatchFile(join(RACINE, f));
      const { default: toutes } = await import(pathToFileURL(SOURCE).href);
      return `export default ${JSON.stringify(extraire(toutes, code))};`;
    },
  };
}
