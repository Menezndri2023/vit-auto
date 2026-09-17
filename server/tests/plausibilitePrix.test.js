import { describe, it, expect } from "vitest";
import { createVehicle, updateVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Décision de l'exploitant (2026-09-17) : AUCUN plafond sur les montants. Les
// bornes « d'absurdité » du 2026-09-10 refusaient des publications réelles
// (« dépasse la limite ») ; elles sont retirées. Ces tests garantissent que
// la publication et la modification acceptent n'importe quel montant, et
// qu'un montant inhabituel n'est que signalé par le moteur de validation.

describe("Montants des annonces — aucun plafond", () => {
  const partenaire = () => createUser({
    role: "partenaire", sellerType: "particulier", kycStatus: "VERIFIE", country: "MA",
  });

  it("publie une location à un tarif journalier et une caution très élevés", async () => {
    const p = await partenaire();
    const { req, res } = mockReqRes({
      user: p,
      body: {
        title: "Bugatti Chiron — location prestige", type: "location", marque: "Bugatti", modele: "Chiron",
        annee: 2024, pricePerDay: 25000, caution: 500000, ville: "Casablanca",
        images: ["https://cdn.example.test/a.jpg"],
      },
    });
    await createVehicle(req, res);
    expect([200, 201], JSON.stringify(res.body)).toContain(res.statusCode);
    const v = await Vehicle.findOne({ title: /Chiron/ }).lean();
    expect(v.pricePerDay).toBe(25000);
    expect(v.caution).toBe(500000);
    // Signalé, jamais refusé.
    expect((v.validationWarnings || []).some((w) => /\[MONTANT\]/.test(w))).toBe(true);
  });

  it("publie une vente à un prix hors norme", async () => {
    const p = await partenaire();
    const { req, res } = mockReqRes({
      user: p,
      body: {
        title: "Ferrari 250 GTO", type: "vente", marque: "Ferrari", modele: "250 GTO",
        annee: 1962, priceForSale: 48000000, ville: "Casablanca",
        images: ["https://cdn.example.test/a.jpg"],
      },
    });
    await createVehicle(req, res);
    expect([200, 201], JSON.stringify(res.body)).toContain(res.statusCode);
  });

  it("accepte aussi la MODIFICATION vers un montant très élevé", async () => {
    const p = await partenaire();
    const v = await createVehicleDoc({ owner: p._id, type: "location", pricePerDay: 60 });
    const { req, res } = mockReqRes({ user: p, params: { id: String(v._id) }, body: { pricePerDay: 9000, caution: 300000 } });
    await updateVehicle(req, res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const maj = await Vehicle.findById(v._id).lean();
    expect(maj.pricePerDay).toBe(9000);
    expect(maj.caution).toBe(300000);
  });
});
