#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// GARDE-FOU : tableau de dépendances lisant une constante déclarée plus bas
// ═══════════════════════════════════════════════════════════════════════════
// Le 2026-09-08, tout le panneau d'administration a été remplacé en production
// par un écran d'erreur. Cause : `const headers = useMemo(...)` était déclaré
// ~550 lignes plus bas qu'un `useCallback` qui le citait dans son TABLEAU DE
// DÉPENDANCES.
//
// La nuance est fine et se répète facilement :
//   • le CORPS d'un callback peut lire une constante déclarée plus bas — il ne
//     s'exécute qu'après le rendu, la déclaration a eu lieu entre-temps ;
//   • un TABLEAU DE DÉPENDANCES, lui, est évalué à CHAQUE RENDU. Le lire avant
//     la déclaration `const` lève « Cannot access X before initialization » et
//     fait tomber l'écran entier.
//
// `no-use-before-define` d'ESLint signale les deux indifféremment : sur ce
// dépôt il remonte 139 cas, dont l'écrasante majorité est inoffensive. Le bruit
// rendait la règle inutilisable, donc désactivée, donc le cas mortel invisible.
// Ce script ne retient QUE le cas mortel.
//
// Usage : node scripts/checkDependencyArrays.mjs [chemin]
// Sort en code 1 s'il trouve un cas — utilisable en intégration continue.

import { ESLint } from "eslint";
import fs from "node:fs";

const cible = process.argv[2] || "src/";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: {
    files: ["**/*.jsx", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-use-before-define": ["error", { functions: false, classes: false, variables: true }],
    },
  },
});

const resultats = await eslint.lintFiles([cible]);
const fatals = [];

for (const fichier of resultats) {
  const lignes = fs.readFileSync(fichier.filePath, "utf8").split("\n");

  for (const m of fichier.messages) {
    if (m.ruleId !== "no-use-before-define") continue;

    // Seul un tableau de dépendances compte : `}, [x, y]);` ou `[x, y]);` sur
    // sa propre ligne. Tout le reste vit dans un corps de fonction.
    const source = lignes[m.line - 1] ?? "";
    if (!/^\s*\}?\s*,?\s*\[/.test(source)) continue;

    const nom = (m.message.match(/^'([^']+)'/) || [])[1];
    if (!nom) continue;

    // La question « la déclaration vient-elle après ? » est déjà tranchée par
    // ESLint, qui raisonne sur les PORTÉES. Ne pas la recalculer à la main :
    // une première version de ce script cherchait la première ligne
    // `const <nom>` du fichier et tombait sur une homonyme déclarée plus haut
    // dans une AUTRE fonction — elle concluait « déclarée avant » et laissait
    // passer le cas mortel qu'elle était censée attraper.
    const motif = new RegExp(`^\\s*(const|let)\\s+(\\[\\s*)?${nom}\\b`);
    const apres = lignes.findIndex((l, i) => i + 1 > m.line && motif.test(l));

    fatals.push({
      fichier: fichier.filePath.replace(`${process.cwd()}/`, ""),
      ligne: m.line,
      nom,
      ligneDeclaration: apres >= 0 ? apres + 1 : null,
      source: source.trim(),
    });
  }
}

if (fatals.length === 0) {
  console.log(`✅ Aucun tableau de dépendances ne lit une constante déclarée plus bas (${cible}).`);
  process.exit(0);
}

console.error(`\n❌ ${fatals.length} tableau(x) de dépendances lisant une constante déclarée plus bas.`);
console.error("   Chacun fait planter l'écran entier au rendu, en production comme en local.\n");
for (const f of fatals) {
  console.error(`   ${f.fichier}:${f.ligne}`);
  console.error(`     ${f.source}`);
  console.error(f.ligneDeclaration
    ? `     « ${f.nom} » n'est déclaré qu'à la ligne ${f.ligneDeclaration} — remontez sa déclaration.\n`
    : `     « ${f.nom} » est lu avant sa déclaration — remontez celle-ci avant cet usage.\n`);
}
process.exit(1);
