// Bloque un push sur toute lecture synchrone d'une constante avant sa
// déclaration (voir eslint-rules/lecture-avant-declaration.js). Exécuté seul :
// le lint complet du dépôt porte des erreurs historiques non bloquantes, et
// cette règle-ci ne doit jamais être noyée dedans — elle correspond à une
// panne totale d'écran, pas à un style.
import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: process.cwd() });
const resultats = await eslint.lintFiles(["src/**/*.{js,jsx}"]);
const fautes = resultats.flatMap((r) => r.messages.filter((m) => m.ruleId === "vit/lecture-avant-declaration").map((m) => `${r.filePath.replace(process.cwd() + "/", "")}:${m.line}:${m.column} ${m.message}`));
if (fautes.length) {
  console.log(`✗ ${fautes.length} lecture(s) avant déclaration — page de secours garantie à l'exécution :`);
  for (const f of fautes) console.log("   " + f);
  process.exit(1);
}
console.log(`✓ aucune lecture avant déclaration (${resultats.length} fichiers)`);
