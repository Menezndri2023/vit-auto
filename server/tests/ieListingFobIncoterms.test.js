import { describe, it, expect } from "vitest";
import { createListing as createListingCtrl, updateListing } from "../controllers/importExportController.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { createUser, createImporterProfile } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Prix FOB et méthodes d'export — persistance jusqu'en base.
//
// Ce dépôt a un antécédent précis : un champ absent d'une liste blanche de
// contrôleur est ignoré SANS ERREUR. Le formulaire affiche « enregistré » et le
// réglage n'existe pas — c'est ainsi que Vehicle.featured est resté mort
// pendant des mois. Ces tests suivent donc les deux nouveaux champs jusqu'au
// document enregistré, pas seulement jusqu'à la réponse HTTP.
//
// Pourquoi ces champs : `price` ne disait pas à quelle condition de livraison
// il correspondait. Le même montant signifie « départ usine », « chargé à
// bord » ou « rendu dédouané » selon l'Incoterm, avec des milliers de dollars
// d'écart — l'acheteur comparait des prix incomparables, et le moteur de coût
// comptait le fret deux fois sur une annonce en CIF.

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
  it("enregistre le prix FOB à la création", async () => {
    const user = await exportateur();
    const { req, res } = mockReqRes({ user, body: baseListing({ priceFOB: 21500 }) });

    await createListingCtrl(req, res);

    expect(res.body.listing, "l'annonce doit être créée").toBeTruthy();
    const saved = await ImportExportListing.findById(res.body.listing._id).lean();
    expect(saved.priceFOB, "le prix FOB ne doit pas être ignoré en silence").toBe(21500);
    expect(saved.price, "le prix affiché reste distinct du FOB").toBe(25000);
  });

  it("refuse un prix FOB absurde plutôt que de l'enregistrer", async () => {
    // Zéro ou négatif rendrait le calcul de coût rendu gratuit ou négatif.
    for (const mauvais of [0, -100, "abc", null]) {
      const user = await exportateur();
      const { req, res } = mockReqRes({ user, body: baseListing({ priceFOB: mauvais }) });
      await createListingCtrl(req, res);
      const saved = await ImportExportListing.findById(res.body.listing._id).lean();
      expect(saved.priceFOB, `priceFOB=${mauvais} doit être écarté`).toBeNull();
    }
  });

  it("enregistre plusieurs méthodes d'export", async () => {
    const user = await exportateur();
    const { req, res } = mockReqRes({
      user, body: baseListing({ incoterm: "FOB", incotermsOffered: ["FOB", "CIF", "CFR"] }),
    });

    await createListingCtrl(req, res);

    const saved = await ImportExportListing.findById(res.body.listing._id).lean();
    expect(saved.incotermsOffered).toEqual(expect.arrayContaining(["FOB", "CIF", "CFR"]));
  });

  it("écarte une méthode incompatible avec le mode de transport", async () => {
    // FOB/CIF/CFR/FAS sont maritimes : les proposer sur un envoi aérien
    // promettrait à l'acheteur une règle de vente inapplicable.
    const user = await exportateur();
    const { req, res } = mockReqRes({
      user, body: baseListing({ shippingType: "aerien", incoterm: "", incotermsOffered: ["FOB", "DAP"] }),
    });

    await createListingCtrl(req, res);

    const saved = await ImportExportListing.findById(res.body.listing._id).lean();
    expect(saved.incotermsOffered, "FOB est maritime, il ne doit pas passer en aérien").not.toContain("FOB");
    expect(saved.incotermsOffered).toContain("DAP");
  });

  it("à la modification, un champ absent est conservé et une valeur vide efface", async () => {
    const user = await exportateur();
    const { req: c, res: rc } = mockReqRes({ user, body: baseListing({ priceFOB: 21500 }) });
    await createListingCtrl(c, rc);
    const id = rc.body.listing._id;

    // Champ absent du corps : la valeur existante survit.
    const { req: r1, res: rs1 } = mockReqRes({ user, params: { id }, body: { mileage: 42000 } });
    await updateListing(r1, rs1);
    expect((await ImportExportListing.findById(id).lean()).priceFOB,
      "une modification partielle ne doit pas effacer le prix FOB").toBe(21500);

    // Valeur vide : effacement volontaire — le partenaire doit pouvoir retirer.
    const { req: r2, res: rs2 } = mockReqRes({ user, params: { id }, body: { priceFOB: "" } });
    await updateListing(r2, rs2);
    expect((await ImportExportListing.findById(id).lean()).priceFOB).toBeNull();
  });
});
