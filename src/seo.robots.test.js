import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
/* global process */

import { LANGUES, LANGUE_DEFAUT } from "./i18n/langueUrl";

// ── robots.txt doit couvrir les adresses PRÉFIXÉES ──────────────────────────
//
// Depuis que la langue vit dans l'URL (2026-09-25), chaque espace privé existe
// aussi sous /en/, /ar/, /es/ et /zh/ — et y répond, puisque le basename du
// routeur résout le préfixe. « Disallow: /admin » ne couvre PAS « /en/admin » :
// les règles héritées laissaient donc l'administration, le profil et le KYC
// explorables sous quatre adresses chacun.
//
// Ce test verrouille la correspondance. Il échoue si quelqu'un ajoute un
// espace privé sans sa contrepartie préfixée.

const ROBOTS = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");
const regles = ROBOTS.split("\n").map((l) => l.trim());
const disallow = regles.filter((l) => l.startsWith("Disallow:")).map((l) => l.slice(9).trim());

describe("robots.txt", () => {
  const nus = disallow.filter((d) => !d.startsWith("/*"));
  const jokers = new Set(disallow.filter((d) => d.startsWith("/*")));

  it("déclare au moins un espace privé", () => {
    expect(nus.length).toBeGreaterThan(0);
  });

  it("couvre chaque espace privé sous préfixe de langue", () => {
    const manquants = nus.filter((d) => !jokers.has(`/*${d}`));
    expect(manquants, `sans contrepartie « /*<chemin> » : ${manquants.join(", ")}`).toEqual([]);
  });

  it("annonce le sitemap", () => {
    expect(ROBOTS).toContain("Sitemap: https://vit-auto.com/sitemap.xml");
  });

  it("n'interdit aucune page publique traduite", () => {
    // Les quatre préfixes eux-mêmes doivent rester explorables : les bloquer
    // rendrait le chantier hreflang entièrement inutile.
    for (const l of LANGUES.filter((x) => x.code !== LANGUE_DEFAUT)) {
      expect(disallow).not.toContain(`/${l.code}`);
      expect(disallow).not.toContain(`/${l.code}/`);
    }
  });
});
