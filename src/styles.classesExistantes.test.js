import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { dirname, join, resolve, basename } from "path";
import { fileURLToPath } from "url";

// ── Toute classe citée existe-t-elle dans son module CSS ? ─────────────────
//
// `className={styles.primaryBtn}` quand le module définit `.btnPrimary` rend
// `className={undefined}` : l'élément sort SANS AUCUN STYLE. Rien ne le
// signale — ni le build, ni le lint, ni les tests de rendu, qui vérifient
// qu'une page ne plante pas, pas qu'elle est habillée.
//
// Ce balayage en a trouvé 39 le 2026-09-27, dont un bouton d'action du
// tableau de bord partenaire et dix éléments de modales d'administration.
// La plupart étaient des noms INVERSÉS entre le JSX et le CSS
// (`.primaryBtn` cité contre `.btnPrimary` défini) : le style existait, il
// n'était simplement jamais appliqué. C'est le type de défaut qu'on ne voit
// qu'en ouvrant la page en question, un jour, par hasard.
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

function fichiersJsx(dossier = join(RACINE, "src"), acc = []) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) fichiersJsx(p, acc);
    else if (/\.jsx$/.test(p) && !/\.test\./.test(p)) acc.push(p);
  }
  return acc;
}

describe("Classes CSS référencées", () => {
  const fichiers = fichiersJsx();

  it("balaie bien tout le front", () => {
    // Filet contre un détecteur qui se casse en silence : s'il ne lit plus
    // rien, le test suivant passerait au vert sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(60);
  });

  it("chaque styles.X existe dans le module CSS importé", () => {
    const manquants = [];
    let verifiees = 0;

    for (const f of fichiers) {
      const src = readFileSync(f, "utf8");
      for (const imp of src.matchAll(/import\s+(\w+)\s+from\s+"([^"]+\.module\.css)"/g)) {
        const [, alias, relatif] = imp;
        const cheminCss = resolve(dirname(f), relatif);
        if (!existsSync(cheminCss)) {
          manquants.push(`${basename(f)} importe ${relatif}, qui n'existe pas`);
          continue;
        }
        const definies = new Set(
          [...readFileSync(cheminCss, "utf8").matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1])
        );
        for (const u of src.matchAll(new RegExp("\\b" + alias + "\\.([a-zA-Z_][\\w]*)", "g"))) {
          verifiees++;
          if (!definies.has(u[1])) {
            manquants.push(`${f.replace(RACINE + "/", "")} → ${alias}.${u[1]} absent de ${basename(cheminCss)}`);
          }
        }
      }
    }

    expect(verifiees).toBeGreaterThan(2000);
    expect(
      manquants.length,
      `Classe(s) citée(s) sans définition — l'élément sortira sans style :\n  ${[...new Set(manquants)].join("\n  ")}`
    ).toBe(0);
  });
});
