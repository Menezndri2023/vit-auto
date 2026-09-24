import { describe, it, expect } from "vitest";
import { repliInternational, annonceVisible } from "./repliInternational";

// Règle de l'exploitant (2026-09-24) : carrousel, vedette, catalogue, loisirs,
// chauffeurs et pièces montrent le contenu du PAYS du visiteur ; s'il n'y a
// rien dans son pays, l'offre internationale ENTIÈRE, jamais une page vide.

const ma = (n) => Array.from({ length: n }, (_, i) => ({ _id: `ma${i}`, country: "MA" }));
const sansPays = { _id: "orpheline", country: null };

describe("repliInternational — bascule sur l'offre internationale", () => {
  it("ne bascule pas quand le visiteur a du contenu dans son pays", () => {
    expect(repliInternational(ma(12), "MA")).toBe(false);
  });

  it("bascule quand le pays du visiteur n'a aucun contenu", () => {
    expect(repliInternational(ma(12), "CI")).toBe(true);
    expect(repliInternational(ma(12), "FR")).toBe(true);
  });

  it("se tait tant que rien n'est chargé", () => {
    expect(repliInternational([], "CI")).toBe(false);
    expect(repliInternational(undefined, "CI")).toBe(false);
  });

  // ── Le défaut corrigé le 2026-09-24 ──────────────────────────────────────
  // L'ancien test était `!jeu.some((x) => !x.country || x.country === pays)` :
  // une annonce sans pays y comptait comme une preuve d'offre locale. Il s'en
  // crée dès qu'un partenaire n'a pas de pays sur sa fiche (`country:
  // business?.country || req.user.country || null`, les quatre contrôleurs).
  it("UNE annonce sans pays n'annule pas le repli pour toute la section", () => {
    const jeu = [...ma(12), sansPays];
    expect(repliInternational(jeu, "CI")).toBe(true);

    // Conséquence concrète : le visiteur ivoirien voit les 13 annonces, pas la
    // seule orpheline. C'est exactement ce que l'ancienne règle produisait.
    const vues = jeu.filter((x) => annonceVisible(x.country, "CI", repliInternational(jeu, "CI")));
    expect(vues).toHaveLength(13);
  });

  it("une annonce du pays du visiteur, elle, empêche bien le repli", () => {
    const jeu = [...ma(12), { _id: "ci1", country: "CI" }];
    expect(repliInternational(jeu, "CI")).toBe(false);
  });

  it("un visiteur non localisable (INTL) ne trouve aucun contenu « de son pays » et bascule", () => {
    expect(repliInternational(ma(12), "INTL")).toBe(true);
  });
});

describe("annonceVisible — ce que le visiteur voit", () => {
  it("hors repli : son pays et les annonces sans pays, rien d'autre", () => {
    expect(annonceVisible("MA", "MA", false)).toBe(true);
    expect(annonceVisible(null, "MA", false)).toBe(true);
    expect(annonceVisible("FR", "MA", false)).toBe(false);
  });

  it("en repli : tout passe", () => {
    expect(annonceVisible("FR", "CI", true)).toBe(true);
    expect(annonceVisible("MA", "CI", true)).toBe(true);
  });

  it("une annonce sans pays reste visible partout — jamais de régression sur l'existant", () => {
    for (const pays of ["MA", "CI", "FR", "INTL"]) {
      expect(annonceVisible(null, pays, false)).toBe(true);
    }
  });
});
