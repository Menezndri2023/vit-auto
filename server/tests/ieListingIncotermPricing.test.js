import { describe, it, expect } from "vitest";
import { createListing as createListingCtrl, updateListing } from "../controllers/importExportController.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { createUser, createImporterProfile } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Prix par Incoterm — persistance jusqu'en base.
//
// Ce dépôt a un antécédent précis : un champ absent d'une liste blanche de
// contrôleur est ignoré SANS ERREUR. Le formulaire affiche « enregistré » et le
// réglage n'existe pas — c'est ainsi que Vehicle.featured est resté mort
// pendant des mois. Ces tests suivent donc les deux nouveaux champs jusqu'au
// document enregistré, pas seulement jusqu'à la réponse HTTP.
//
// Pourquoi ce champ : un prix seul ne veut rien dire. « 21 500 $ » signifie
// chargé à bord (FOB), fret payé (CFR) ou fret et assurance payés (CIF) selon
// la règle retenue, avec des milliers de dollars d'écart. Et un exportateur
// travaille rarement sous une seule règle — FOB pour l'acheteur qui a son
// transitaire, CIF pour celui qui n'en a pas — avec un prix différent pour
// chacune. `incoterm` reste la règle par défaut, celle du prix affiché.

const baseListing = (over = {}) => ({
  title: "Toyota Land Cruiser 2021",
  make: "Toyota", model: "Land Cruiser", year: 2021,
  sourceCountry: "Chine", availableIn: ["Côte d'Ivoire", "Sénégal"],
  price: 25000, currency: "USD",
  shippingType: "maritime",
  ...over,
});

async function exportateur() {
  const user = await createUser({ role: "partenaire", isFounder: true });
  await createImporterProfile(user._id, { status: "verified" });
  return user;
}

describe("Annonce Import/Export — prix FOB et méthodes d'export", () => {
  it("enregistre un prix par Incoterm accepté", async () => {
    const user = await exportateur();
    const { req, res } = mockReqRes({
      user, body: baseListing({
        incoterm: "FOB",
        incotermPricing: [{ incoterm: "CIF", price: 27800 }, { incoterm: "CFR", price: 26900 }],
      }),
    });

    await createListingCtrl(req, res);

    expect(res.body.listing, "l'annonce doit être créée").toBeTruthy();
    const saved = await ImportExportListing.findById(res.body.listing._id).lean();
    expect(saved.incoterm, "la règle par défaut est celle du prix affiché").toBe("FOB");
    expect(saved.price).toBe(25000);
    expect(saved.incotermPricing).toEqual([
      { incoterm: "CIF", price: 27800 },
      { incoterm: "CFR", price: 26900 },
    ]);
  });

  it("accepte une variante SANS prix — « à convenir », jamais un montant deviné", async () => {
    const user = await exportateur();
    const { req, res } = mockReqRes({
      user, body: baseListing({ incoterm: "FOB", incotermPricing: [{ incoterm: "CIF" }] }),
    });

    await createListingCtrl(req, res);

    const saved = await ImportExportListing.findById(res.body.listing._id).lean();
    expect(saved.incotermPricing[0]).toEqual({ incoterm: "CIF", price: null });
  });

  it("un prix nul ou négatif devient « à convenir » au lieu d'une importation gratuite", async () => {
    for (const mauvais of [0, -100, "abc"]) {
      const user = await exportateur();
      const { req, res } = mockReqRes({
        user, body: baseListing({ incoterm: "FOB", incotermPricing: [{ incoterm: "CIF", price: mauvais }] }),
      });
      await createListingCtrl(req, res);
      const saved = await ImportExportListing.findById(res.body.listing._id).lean();
      expect(saved.incotermPricing[0].price, `price=${mauvais} doit devenir null`).toBeNull();
    }
  });

  it("écarte une règle maritime sur un envoi aérien, et les doublons", async () => {
    // FOB/CIF/CFR/FAS sont maritimes : les proposer en aérien promettrait à
    // l'acheteur une condition de vente inapplicable. La règle par défaut n'a
    // pas non plus à être répétée — son prix, c'est `price`.
    const user = await exportateur();
    const { req, res } = mockReqRes({
      user, body: baseListing({
        shippingType: "aerien", incoterm: "DAP",
        incotermPricing: [
          { incoterm: "CIF", price: 27800 },   // maritime → écartée
          { incoterm: "DAP", price: 30000 },   // = défaut → écartée
          { incoterm: "DDP", price: 31000 },
          { incoterm: "DDP", price: 32000 },   // doublon → écarté
        ],
      }),
    });

    await createListingCtrl(req, res);

    const saved = await ImportExportListing.findById(res.body.listing._id).lean();
    expect(saved.incotermPricing).toEqual([{ incoterm: "DDP", price: 31000 }]);
  });

  it("à la modification, un champ absent est conservé et un tableau vide efface", async () => {
    const user = await exportateur();
    const { req: c, res: rc } = mockReqRes({
      user, body: baseListing({ incoterm: "FOB", incotermPricing: [{ incoterm: "CIF", price: 27800 }] }),
    });
    await createListingCtrl(c, rc);
    const id = rc.body.listing._id;

    const { req: r1, res: rs1 } = mockReqRes({ user, params: { id }, body: { mileage: 42000 } });
    await updateListing(r1, rs1);
    expect((await ImportExportListing.findById(id).lean()).incotermPricing,
      "une modification partielle ne doit pas effacer les variantes").toHaveLength(1);

    const { req: r2, res: rs2 } = mockReqRes({ user, params: { id }, body: { incotermPricing: [] } });
    await updateListing(r2, rs2);
    expect((await ImportExportListing.findById(id).lean()).incotermPricing).toEqual([]);
  });
});
