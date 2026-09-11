import { describe, it, expect } from "vitest";
import { prixInvraisemblable, PRIX_JOUR_MAX_USD } from "../constants/plausibilitePrix.js";
import { createVehicle, updateVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Une Changan CS55 a été publiée à 60 600 MAD la journée — 6 110 USD — quand
// toutes les autres locations du même pays tenaient entre 45 et 101 USD. Elle
// est restée en ligne et réservable pendant plus d'un mois : rien ne la
// signalait, et l'admin l'avait approuvée.
//
// Le contrôle porte sur l'ABSURDITÉ, pas sur le marché : une voiture de sport
// se loue légitimement 1 500 USD la journée, et ce prix doit passer.

describe("Plausibilité des montants", () => {
  it("laisse passer un tarif élevé mais réel, refuse l'absurde", async () => {
    expect(prixInvraisemblable({ type: "location", pricePerDay: 1500 })).toBeNull();
    expect(prixInvraisemblable({ type: "location", pricePerDay: PRIX_JOUR_MAX_USD })).toBeNull();
    const refus = prixInvraisemblable({ type: "location", pricePerDay: 6110 });
    expect(refus?.champ).toBe("pricePerDay");
    // Le message doit nommer la cause probable : c'est ce qui permet au
    // partenaire de corriger sans écrire au support.
    expect(refus.message).toMatch(/devise/i);
    expect(refus.message).toMatch(/mensuel|vente/i);
  });

  it("ne confond pas les types : un prix de vente élevé n'est pas un tarif journalier", async () => {
    expect(prixInvraisemblable({ type: "vente", priceForSale: 250000 })).toBeNull();
    expect(prixInvraisemblable({ type: "vente", priceForSale: 9_000_000 })?.champ).toBe("priceForSale");
    // Un prix de vente de 60 000 ne doit PAS être jugé sur l'échelle journalière.
    expect(prixInvraisemblable({ type: "vente", priceForSale: 60000 })).toBeNull();
  });

  it("couvre aussi la caution", async () => {
    expect(prixInvraisemblable({ caution: 5000 })).toBeNull();
    expect(prixInvraisemblable({ caution: 900_000 })?.champ).toBe("caution");
  });

  it("tolère les champs absents", async () => {
    expect(prixInvraisemblable({})).toBeNull();
    expect(prixInvraisemblable()).toBeNull();
  });
});

describe("Refus à la publication et à la modification", () => {
  const partenaire = () => createUser({
    role: "partenaire", sellerType: "particulier", kycStatus: "VERIFIE", country: "MA",
  });

  it("refuse la création d'une location au tarif absurde, et n'écrit rien", async () => {
    const p = await partenaire();
    const avant = await Vehicle.countDocuments();
    const { req, res } = mockReqRes({
      user: p,
      body: {
        title: "Changan CS55 Plus", type: "location", marque: "Changan", modele: "CS55",
        annee: 2023, pricePerDay: 6110, caution: 500, ville: "Casablanca",
        images: ["https://cdn.example.test/a.jpg"],
      },
    });
    await createVehicle(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.champ).toBe("pricePerDay");
    expect(await Vehicle.countDocuments()).toBe(avant);
  });

  it("refuse aussi la MODIFICATION — sinon il suffirait de publier juste puis d'éditer", async () => {
    const p = await partenaire();
    const v = await createVehicleDoc({ owner: p._id, type: "location", pricePerDay: 60 });

    const { req, res } = mockReqRes({
      user: p, params: { id: String(v._id) }, body: { pricePerDay: 6110 },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(400);
    expect((await Vehicle.findById(v._id).lean()).pricePerDay).toBe(60);
  });

  it("ne bloque PAS une correction qui ne touche pas au montant en cause", async () => {
    // Une annonce publiée avant ce contrôle peut porter un tarif hérité.
    // Refuser alors une correction de description enfermerait le partenaire
    // dans son erreur, au lieu de l'aider à en sortir.
    const p = await partenaire();
    const v = await createVehicleDoc({ owner: p._id, type: "location", pricePerDay: 6110 });

    const { req, res } = mockReqRes({
      user: p, params: { id: String(v._id) },
      body: { description: "Véhicule révisé, climatisation, quatre pneus neufs, entretien à jour." },
    });
    await updateVehicle(req, res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect((await Vehicle.findById(v._id).lean()).description).toMatch(/pneus neufs/);
  });

  it("laisse publier un tarif élevé mais plausible", async () => {
    const p = await partenaire();
    const { req, res } = mockReqRes({
      user: p,
      body: {
        title: "Porsche 911 — location prestige", type: "location", marque: "Porsche",
        modele: "911", annee: 2024, pricePerDay: 1500, caution: 20000, ville: "Marrakech",
        images: ["https://cdn.example.test/a.jpg"],
      },
    });
    await createVehicle(req, res);
    expect([200, 201], JSON.stringify(res.body)).toContain(res.statusCode);
  });
});
