import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
/* global process */

// ── La clé IndexNow ─────────────────────────────────────────────────────────
//
// IndexNow prouve la propriété du domaine par un fichier : son NOM est la clé,
// son CONTENU doit être la même clé. Si les deux divergent, Bing répond 403 et
// plus rien n'est signalé — sans aucune erreur visible de notre côté, puisque
// personne ne lit ce fichier à la main.
//
// Deux fichiers clés sont tout aussi silencieux : le script ne saurait lequel
// utiliser, et l'un des deux finirait par être le mauvais.

const PUBLIC = resolve(process.cwd(), "public");
const fichiers = readdirSync(PUBLIC).filter((f) => /^[0-9a-f]{8,128}\.txt$/.test(f));

describe("IndexNow", () => {
  it("expose exactement un fichier clé dans public/", () => {
    expect(fichiers, `trouvés : ${fichiers.join(", ") || "aucun"}`).toHaveLength(1);
  });

  it("le contenu du fichier est identique à son nom", () => {
    const [nom] = fichiers;
    const cle = nom.replace(/\.txt$/, "");
    expect(readFileSync(join(PUBLIC, nom), "utf8").trim()).toBe(cle);
  });

  it("le fichier clé n'est pas interdit au crawl", () => {
    // Un `Disallow` qui l'attraperait empêcherait la vérification de propriété.
    const robots = readFileSync(join(PUBLIC, "robots.txt"), "utf8");
    const interdits = robots.split("\n")
      .filter((l) => l.trim().startsWith("Disallow:"))
      .map((l) => l.split(":")[1].trim());
    const chemin = `/${fichiers[0]}`;
    for (const d of interdits) {
      const motif = new RegExp("^" + d.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
      expect(motif.test(chemin), `« Disallow: ${d} » bloque ${chemin}`).toBe(false);
    }
  });
});
