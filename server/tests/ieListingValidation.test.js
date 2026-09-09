import { describe, it, expect, beforeEach } from "vitest";
import ImportCostConfig from "../models/ImportCostConfig.js";
import { validateListingForPublication } from "../services/ieListingValidation.js";
import { seedImportCostConfigs } from "../scripts/seedImportCostConfigs.js";

// Contrôle d'une annonce d'export avant publication.
//
// La validation se résumait à « Champs obligatoires manquants » — sans dire
// lesquels. Le partenaire corrigeait au hasard, ou renonçait.
//
// La distinction entre ERREUR et AVERTISSEMENT est l'essentiel de ce fichier.
// Le cas le plus utile est celui d'une annonce parfaitement valide dont le
// véhicule dépasse la limite d'âge d'un pays visé : elle part, mais le
// véhicule y serait REFUSÉ AU PORT. Le partenaire doit l'apprendre avant de
// publier, pas le découvrir après le paiement de l'acheteur.

const ANNEE = new Date().getFullYear();

const annonce = (over = {}) => ({
  title: "Toyota Land Cruiser", make: "Toyota", model: "Land Cruiser",
  year: ANNEE, sourceCountry: "Chine", price: 25000,
  availableIn: ["Maroc"], incoterm: "FOB", shippingType: "maritime",
  photos: ["a.jpg", "b.jpg", "c.jpg"],
  ...over,
});

describe("Contrôle avant publication — erreurs bloquantes", () => {
  beforeEach(async () => { await ImportCostConfig.deleteMany({}); await seedImportCostConfigs(); });

  it("nomme CHAQUE champ manquant, au lieu d'un message unique", async () => {
    const r = await validateListingForPublication({ title: "", make: "", price: 0 });

    expect(r.valid).toBe(false);
    const champs = r.errors.map((e) => e.field);
    expect(champs).toEqual(expect.arrayContaining(["title", "make", "model", "year", "sourceCountry", "price"]));
    // Chaque message doit être actionnable, pas un constat.
    for (const e of r.errors) expect(e.message).toMatch(/Indiquez|doit/i);
  });

  it("refuse une annonce sans pays de destination, en expliquant pourquoi", async () => {
    const r = await validateListingForPublication(annonce({ availableIn: [] }));

    expect(r.valid).toBe(false);
    const erreur = r.errors.find((e) => e.field === "availableIn");
    expect(erreur.message, "le partenaire doit comprendre la conséquence").toMatch(/aucun acheteur/i);
  });

  it("refuse un Incoterm maritime sur un envoi aérien", async () => {
    const r = await validateListingForPublication(annonce({ shippingType: "aerien" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "incoterm")).toBe(true);
  });

  it("refuse une année aberrante", async () => {
    for (const mauvaise of [1900, ANNEE + 5, "abc"]) {
      const r = await validateListingForPublication(annonce({ year: mauvaise }));
      expect(r.valid, `année ${mauvaise}`).toBe(false);
    }
  });

  it("accepte une annonce complète", async () => {
    const r = await validateListingForPublication(annonce());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe("Contrôle avant publication — avertissements", () => {
  beforeEach(async () => { await ImportCostConfig.deleteMany({}); await seedImportCostConfigs(); });

  it("PRÉVIENT que le véhicule serait refusé au port, sans bloquer", async () => {
    // Le cas central : annonce valide, véhicule trop vieux pour le Maroc.
    const r = await validateListingForPublication(annonce({ year: ANNEE - 8, availableIn: ["Maroc"] }));

    expect(r.valid, "l'annonce reste publiable").toBe(true);
    const avertissement = r.warnings.find((w) => /INTERDITE/.test(w.message));
    expect(avertissement).toBeTruthy();
    expect(avertissement.message).toMatch(/Maroc/);
    expect(avertissement.message).toMatch(/5 ans/);
    expect(avertissement.message, "la conséquence concrète doit être dite").toMatch(/refusé au port/i);
  });

  it("ne prévient pas quand le véhicule respecte la limite", async () => {
    const r = await validateListingForPublication(annonce({ year: ANNEE - 2 }));
    expect(r.warnings.some((w) => /INTERDITE/.test(w.message))).toBe(false);
  });

  it("signale les destinations sans barème douanier", async () => {
    // Les neuf marchés desservis ont désormais un barème : l'avertissement ne
    // se déclenche donc que sur un pays hors périmètre. Ce test citait le Mali
    // et le Togo — il a justement échoué le jour où ils ont été configurés,
    // ce qui est le comportement attendu d'un test bien écrit.
    const r = await validateListingForPublication(annonce({ availableIn: ["Maroc", "Ouganda", "Kenya"] }));

    const w = r.warnings.find((x) => /barème douanier/i.test(x.message));
    expect(w.message).toMatch(/Ouganda/);
    expect(w.message).toMatch(/Kenya/);
    expect(w.message, "le Maroc est configuré, il ne doit pas être cité").not.toMatch(/Maroc/);
    expect(w.message).toMatch(/pas de coût rendu/i);
  });

  it("signale l'absence d'Incoterm et sa conséquence sur le prix affiché", async () => {
    const r = await validateListingForPublication(annonce({ incoterm: "" }));
    const w = r.warnings.find((x) => x.field === "incoterm");
    expect(w.message).toMatch(/surestimé/i);
  });

  it("signale un pays d'origine non reconnu — un accord commercial est en jeu", async () => {
    const r = await validateListingForPublication(annonce({ sourceCountry: "Wakanda" }));
    const w = r.warnings.find((x) => x.field === "sourceCountry");
    expect(w.message).toMatch(/taux de droits le plus élevé/i);
  });

  it("signale un nombre de photos insuffisant", async () => {
    const r = await validateListingForPublication(annonce({ photos: ["a.jpg"] }));
    expect(r.warnings.some((w) => w.field === "photos")).toBe(true);
  });

  it("une annonce irréprochable ne déclenche aucun avertissement", async () => {
    const r = await validateListingForPublication(annonce({ year: ANNEE - 1 }));
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});
