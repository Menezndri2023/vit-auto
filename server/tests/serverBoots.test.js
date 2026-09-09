import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// LE SERVEUR DÉMARRE-T-IL ? Aucun test ne le vérifiait.
//
// Un import mort — `import { X } from "./y.js"` où `y.js` n'exporte plus `X` —
// est passé en production sans que rien ne l'arrête. Node, en ESM natif, refuse
// de charger le module et le serveur ne démarre pas du tout : panne totale de
// l'API, pas une régression fonctionnelle.
//
// Pourquoi les 1091 tests ne l'ont pas vu : vitest transforme les modules avant
// de les exécuter, et cette transformation rend un import nommé manquant
// `undefined` au lieu de lever. Le code passait donc les tests et cassait au
// démarrage réel. C'est précisément le genre d'écart qu'un test doit couvrir.
//
// Ce fichier vérifie deux choses complémentaires :
//  1. tout module de premier plan se charge réellement (`await import`) ;
//  2. aucun import nommé ne réclame un export qui n'existe pas.

const RACINE = process.cwd();

const listerFichiers = (dossier, acc = []) => {
  for (const entree of fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true })) {
    const rel = path.join(dossier, entree.name);
    if (entree.isDirectory()) listerFichiers(rel, acc);
    else if (entree.name.endsWith(".js")) acc.push(rel);
  }
  return acc;
};

describe("Démarrage du serveur", () => {
  it("server.js se charge sans erreur", async () => {
    // Le test le plus simple, et celui qui manquait : si cette ligne échoue,
    // l'API est morte en production.
    await expect(import("../server.js")).resolves.toBeTruthy();
  }, 60_000);

  it("aucun import nommé ne réclame un export inexistant", async () => {
    // Analyse statique : on lit les `import { a, b } from "./x.js"` internes et
    // on vérifie que la cible exporte bien chacun des noms. Complète le test
    // ci-dessus, qui ne traverse que les modules réellement atteints depuis
    // server.js — un contrôleur non encore branché passerait autrement inaperçu.
    const fichiers = ["controllers", "services", "routes", "utils", "models", "middleware", "constants"]
      .filter((d) => fs.existsSync(path.join(RACINE, d)))
      .flatMap((d) => listerFichiers(d));

    const manquants = [];

    for (const fichier of fichiers) {
      const source = fs.readFileSync(path.join(RACINE, fichier), "utf8");
      const imports = source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g);

      for (const [, noms, cible] of imports) {
        const chemin = path.resolve(path.dirname(path.join(RACINE, fichier)), cible);
        if (!fs.existsSync(chemin)) continue;      // alias ou extension gérée ailleurs
        const cibleSource = fs.readFileSync(chemin, "utf8");

        for (const brut of noms.split(",")) {
          const nom = brut.split(/\s+as\s+/)[0].trim();
          if (!nom || nom === "default") continue;
          // `export const X`, `export function X`, `export async function X`,
          // `export { X }`, `export class X`.
          const exporte = new RegExp(
            `export\\s+(const|let|var|function|async function|class)\\s+${nom}\\b`
            + `|export\\s*\\{[^}]*\\b${nom}\\b`
          ).test(cibleSource);
          if (!exporte) manquants.push(`${fichier} → ${cible} : « ${nom} »`);
        }
      }
    }

    expect(manquants, `import(s) mort(s) — le serveur ne démarrera pas :\n${manquants.join("\n")}`)
      .toEqual([]);
  });
});
