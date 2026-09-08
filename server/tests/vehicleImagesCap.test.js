import { describe, it, expect } from "vitest";
import { createVehicle, updateVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Photos d'annonce — plafond relevé et rendu EXPLICITE (2026-09-08).
//
// Le plafond était de 8 et s'appliquait par `images.slice(0, 8)` : un
// partenaire qui déposait douze photos de son véhicule en perdait quatre sans
// le moindre message, et découvrait l'amputation — s'il la découvrait — sur
// son annonce publiée. Une annonce automobile vit de ses photos (intérieur,
// coffre, tableau de bord, pneus, défauts) : le manque se paie en confiance.
//
// Désormais : 20 photos conservées intégralement, et au-delà un refus clair
// plutôt qu'une troncature en douce.

const URLS = (n) => Array.from({ length: n }, (_, i) => `https://images.test/photo-${i + 1}.jpg`);

const partenaire = () => createUser({ role: "partenaire", isFounder: true, sellerType: "particulier" });

describe("Photos d'une annonce — plafond explicite", () => {
  it("conserve les 20 photos à la création — aucune n'est perdue", async () => {
    const user = await partenaire();
    const images = URLS(20);
    const { req, res } = mockReqRes({ user, body: { title: "Toyota Corolla 2020", type: "vente", images } });

    await createVehicle(req, res);

    expect(res.body.vehicle, "l'annonce doit être créée").toBeTruthy();
    const saved = await Vehicle.findById(res.body.vehicle._id);
    expect(saved.images, "les 20 photos doivent être enregistrées").toHaveLength(20);
    expect(saved.images[19]).toBe("https://images.test/photo-20.jpg");
  });

  it("conservait autrefois 8 photos sur 12 : ce n'est plus le cas", async () => {
    const user = await partenaire();
    const { req, res } = mockReqRes({ user, body: { title: "Peugeot 208", type: "vente", images: URLS(12) } });

    await createVehicle(req, res);

    const saved = await Vehicle.findById(res.body.vehicle._id);
    expect(saved.images, "les 12 photos doivent survivre, pas 8").toHaveLength(12);
  });

  it("refuse explicitement au-delà du plafond, au lieu de rogner en silence", async () => {
    const user = await partenaire();
    const { req, res } = mockReqRes({ user, body: { title: "Renault Clio", type: "vente", images: URLS(21) } });

    await createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message, "le message doit dire combien de photos sont acceptées").toMatch(/20/);
    expect(await Vehicle.countDocuments({ title: "Renault Clio" })).toBe(0);
  });

  it("même règle à la modification — c'est là que le partenaire ajoute des photos", async () => {
    const user = await partenaire();
    const { req: c, res: rc } = mockReqRes({ user, body: { title: "Dacia Duster", type: "vente", images: URLS(3) } });
    await createVehicle(c, rc);
    const id = rc.body.vehicle._id;

    const { req, res } = mockReqRes({ user, params: { id }, body: { images: URLS(21) } });
    await updateVehicle(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    const { req: r2, res: rs2 } = mockReqRes({ user, params: { id }, body: { images: URLS(20) } });
    await updateVehicle(r2, rs2);
    const saved = await Vehicle.findById(id);
    expect(saved.images, "20 photos doivent passer à la modification").toHaveLength(20);
  });
});
