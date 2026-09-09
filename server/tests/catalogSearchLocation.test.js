import { describe, it, expect, beforeEach } from "vitest";
import { getVehicles } from "../controllers/vehicleController.js";
import CountryConfig from "../models/CountryConfig.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Recherche par LIEU dans le catalogue public.
//
// Le catalogue restreint les annonces au pays du visiteur. Conséquence non
// voulue : un visiteur ivoirien qui tapait "Paris" ou "France" n'obtenait
// jamais rien — le filtre pays vidait le résultat avant même que la recherche
// soit évaluée, et la recherche ne portait de toute façon que sur le titre,
// la marque et le modèle, jamais sur la ville ni le pays.

const titres = (res) => (res.body.vehicles || []).map((v) => v.title);

const chercher = async (query) => {
  const { req, res } = mockReqRes({ query });
  await getVehicles(req, res);
  return res;
};

describe("Catalogue — recherche par ville et par pays", () => {
  let proprio;

  beforeEach(async () => {
    await CountryConfig.create([
      { code: "FR", name: "France",         defaultCurrency: "EUR" },
      { code: "CI", name: "Côte d'Ivoire",  defaultCurrency: "XOF" },
    ]);
    proprio = await createUser({ role: "partenaire" });
    await createVehicleDoc({
      owner: proprio._id, title: "Renault Master utilitaire",
      marque: "Renault", modele: "Master", country: "FR", ville: "Paris",
    });
    await createVehicleDoc({
      owner: proprio._id, title: "Toyota Corolla berline",
      marque: "Toyota", modele: "Corolla", country: "CI", ville: "Abidjan",
    });
  });

  it("taper une ville étrangère trouve l'annonce malgré le pays du visiteur", async () => {
    const res = await chercher({ search: "Paris", country: "CI" });
    expect(titres(res)).toEqual(["Renault Master utilitaire"]);
  });

  it("taper le NOM du pays trouve l'annonce (le pays est stocké en code ISO)", async () => {
    const res = await chercher({ search: "France", country: "CI" });
    expect(titres(res)).toEqual(["Renault Master utilitaire"]);
  });

  it("sans recherche, le filtre pays reste appliqué", async () => {
    // Le garde-fou du correctif : c'est bien la RECHERCHE qui lève la
    // restriction, pas le correctif qui l'aurait supprimée pour tout le monde.
    const res = await chercher({ country: "CI" });
    expect(titres(res)).toEqual(["Toyota Corolla berline"]);
  });

  it("une recherche qui ne correspond à aucun lieu ne ramène pas tout", async () => {
    const res = await chercher({ search: "Corolla", country: "CI" });
    expect(titres(res)).toEqual(["Toyota Corolla berline"]);
  });
});
