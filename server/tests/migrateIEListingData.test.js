import { describe, it, expect } from "vitest";
import ImportExportListing from "../models/ImportExportListing.js";
import { migrateIEListingData, anneeDepuisTitre } from "../scripts/migrateIEListingData.js";
import { createUser, createImporterProfile } from "./helpers/fixtures.js";

// Remise en ordre des annonces Import/Export importées en masse.
//
// Trois défauts, dont deux invisibles à l'œil nu, rendaient tout calcul de coût
// faux :
//  • 134 des 142 annonces chinoises portaient l'année du jour de l'import
//    (2026) alors que leur titre indiquait 2018 à 2024 — chaque véhicule
//    paraissait neuf, et la limite légale des 5 ans à l'import au Maroc ne se
//    déclenchait jamais ;
//  • « CHINA », « China », « china », « chi'na » et « 中国 » coexistaient pour
//    un même pays, or le taux de droit d'importation dépend de l'origine ;
//  • `availableIn` contenait la phrase « Deliveries available worldwide », et
//    le barème douanier est indexé par pays de destination.

async function creerAnnonce(over = {}) {
  const user = await createUser({ role: "partenaire", isFounder: true });
  const profil = await createImporterProfile(user._id, { status: "verified" });
  return ImportExportListing.create({
    partner: user._id, importerProfile: profil._id,
    title: "Zeekr 001 2022 Long Range", make: "Zeekr", model: "001",
    year: 2026, sourceCountry: "china", price: 25000, currency: "USD",
    availableIn: ["Deliveries available worldwide"],
    ...over,
  });
}

describe("anneeDepuisTitre", () => {
  it("lit l'année du modèle dans le titre", () => {
    expect(anneeDepuisTitre("Zeekr 001 2022 Long Range")).toBe(2022);
    expect(anneeDepuisTitre("Elegant Wagon Volkswagen Variant 2018 380TSI")).toBe(2018);
  });

  it("ignore les nombres qui ne sont pas des années", () => {
    // « 60kWh », « 4WD », « 2.0T » ne doivent jamais passer pour un millésime.
    expect(anneeDepuisTitre("ONVO L60 60kWh Rear Wheel Drive")).toBeNull();
    expect(anneeDepuisTitre("Maxus Star L 2.0T 4WD Elite")).toBeNull();
  });

  it("retient le millésime le plus récent quand le titre en porte deux", () => {
    expect(anneeDepuisTitre("Golf 2015 restylé 2018")).toBe(2018);
  });

  it("ne renvoie rien plutôt qu'une année absurde", () => {
    expect(anneeDepuisTitre("")).toBeNull();
    expect(anneeDepuisTitre(null)).toBeNull();
    expect(anneeDepuisTitre("Toyota 1976 vintage"), "1976 est hors des bornes retenues").toBeNull();
  });
});

describe("Migration des annonces Import/Export", () => {
  it("corrige l'année d'après le titre", async () => {
    const a = await creerAnnonce();
    await migrateIEListingData();

    const relu = await ImportExportListing.findById(a._id).lean();
    expect(relu.year, "l'année du jour de l'import masquait un véhicule de 2022").toBe(2022);
  });

  it("normalise toutes les graphies du pays d'origine", async () => {
    for (const graphie of ["china", "CHINA", "chi'na", "中国", "Chine"]) {
      const a = await creerAnnonce({ sourceCountry: graphie });
      await migrateIEListingData();
      const relu = await ImportExportListing.findById(a._id).lean();
      expect(relu.sourceCountry, `« ${graphie} » doit devenir « Chine »`).toBe("Chine");
    }
  });

  it("remplace la phrase marketing par de vrais pays de destination", async () => {
    const a = await creerAnnonce();
    await migrateIEListingData();

    const relu = await ImportExportListing.findById(a._id).lean();
    expect(relu.availableIn).not.toContain("Deliveries available worldwide");
    expect(relu.availableIn).toContain("Maroc");
    expect(relu.availableIn.length).toBeGreaterThan(1);
  });

  it("conserve les destinations déjà valides et n'écarte que les phrases", async () => {
    const a = await creerAnnonce({
      availableIn: ["Côte d'Ivoire", "Deliveries available worldwide", "Sénégal"],
    });
    await migrateIEListingData();

    const relu = await ImportExportListing.findById(a._id).lean();
    expect(relu.availableIn).toEqual(["Côte d'Ivoire", "Sénégal"]);
  });

  it("est idempotente — relancée, elle ne change plus rien", async () => {
    await creerAnnonce();
    const premier = await migrateIEListingData();
    expect(premier.anneesCorrigees).toBeGreaterThan(0);

    const second = await migrateIEListingData();
    expect(second.anneesCorrigees).toBe(0);
    expect(second.originesNormalisees).toBe(0);
    expect(second.destinationsCorrigees).toBe(0);
  });

  it("laisse intacte une annonce déjà correcte", async () => {
    const a = await creerAnnonce({
      title: "Zeekr 001 2022 Long Range", year: 2022,
      sourceCountry: "Chine", availableIn: ["Maroc"],
    });
    await migrateIEListingData();

    const relu = await ImportExportListing.findById(a._id).lean();
    expect(relu.year).toBe(2022);
    expect(relu.sourceCountry).toBe("Chine");
    expect(relu.availableIn).toEqual(["Maroc"]);
  });
});
