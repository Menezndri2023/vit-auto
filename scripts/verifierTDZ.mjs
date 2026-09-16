// Bloque un push sur les défauts qui garantissent une page de secours à
// l'exécution — jamais un style : lecture synchrone d'une constante avant sa
// déclaration (eslint-rules/lecture-avant-declaration.js) et balise JSX jamais
// importée (eslint-rules/composant-non-defini.js — no-undef ignore les
// balises JSX, et le build passe). Exécuté seul : le lint complet du dépôt
// porte des erreurs historiques non bloquantes, et ces règles-ci ne doivent
// jamais être noyées dedans.
import { ESLint } from "eslint";

const REGLES_BLOQUANTES = {
  "vit/lecture-avant-declaration": "lecture(s) avant déclaration",
  "vit/composant-non-defini":      "composant(s) JSX jamais importé(s)",
};

const eslint = new ESLint({ cwd: process.cwd() });
const resultats = await eslint.lintFiles(["src/**/*.{js,jsx}"]);
let total = 0;
for (const [regle, libelle] of Object.entries(REGLES_BLOQUANTES)) {
  const fautes = resultats.flatMap((r) => r.messages.filter((m) => m.ruleId === regle).map((m) => `${r.filePath.replace(process.cwd() + "/", "")}:${m.line}:${m.column} ${m.message}`));
  if (!fautes.length) continue;
  total += fautes.length;
  console.log(`✗ ${fautes.length} ${libelle} — page de secours garantie à l'exécution :`);
  for (const f of fautes) console.log("   " + f);
}
if (total) process.exit(1);
console.log(`✓ aucune lecture avant déclaration, aucun composant non importé (${resultats.length} fichiers)`);
