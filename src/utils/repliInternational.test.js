import { describe, it, expect } from "vitest";
import { repliInternational, annonceVisible } from "./repliInternational";

// Règle de l'exploitant (2026-10-09) : un visiteur ne voit QUE les offres de
// son pays, sauf s'il en choisit un autre avec le filtre. Plus de repli
// automatique sur l'offre internationale (il existait depuis le 2026-09-11).

const ma = (n) => Array.from({ length: n }, (_, i) => ({ _id: `ma${i}`, country: "MA" }));

describe("repliInternational — plus de bascule automatique", () => {
  it("ne bascule jamais, même quand le pays du visiteur n'a rien", () => {
    expect(repliInternational(ma(12), "CI")).toBe(false);
    expect(repliInternational(ma(12), "MA")).toBe(false);
    expect(repliInternational([], "CI")).toBe(false);
  });
});

describe("annonceVisible — ce que le visiteur voit", () => {
  it("son pays, rien d'autre", () => {
    expect(annonceVisible("MA", "MA", false)).toBe(true);
    expect(annonceVisible("FR", "MA", false)).toBe(false);
  });

  it("un visiteur ivoirien ne voit aucune annonce marocaine", () => {
    expect(ma(12).filter((x) => annonceVisible(x.country, "CI", repliInternational(ma(12), "CI")))).toHaveLength(0);
  });

  it("une annonce sans pays n'appartient à aucun pays : absente des vues par pays", () => {
    for (const pays of ["MA", "CI", "FR"]) expect(annonceVisible(null, pays, false)).toBe(false);
  });
});
