import { describe, it, expect } from "vitest";
import { getVehicleById } from "../controllers/vehicleController.js";
import { getPublicShowroom } from "../controllers/pmsController.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import User from "../models/User.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Suggestion UX (2026-09) : la note de l'agence (User.partnerRating, avis
// bidirectionnels Phase 5) était calculée mais jamais renvoyée par aucune
// API publique — ces tests vérifient qu'elle est bien exposée là où le
// frontend l'attend désormais (VehicleDetails.jsx, PartnerShowroomPublic.jsx).
describe("Exposition publique de partnerRating", () => {
  it("getVehicleById renvoie partnerRating dans owner (visiteur public)", async () => {
    const owner = await createUser({ role: "partenaire", partnerRating: { noteMoyenne: 4.5, nombreAvis: 12 } });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({ params: { id: vehicle._id.toString() } });
    await getVehicleById(req, res);

    expect(res.body.vehicle.owner.partnerRating.noteMoyenne).toBe(4.5);
    expect(res.body.vehicle.owner.partnerRating.nombreAvis).toBe(12);
  });

  it("getVehicleById renvoie partnerRating dans owner (admin)", async () => {
    const admin = await createUser({ role: "admin" });
    const owner = await createUser({ role: "partenaire", partnerRating: { noteMoyenne: 3.8, nombreAvis: 5 } });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({ user: admin, params: { id: vehicle._id.toString() } });
    await getVehicleById(req, res);

    expect(res.body.vehicle.owner.partnerRating.noteMoyenne).toBe(3.8);
  });

  it("getPublicShowroom renvoie partnerRating dans partnerInfo", async () => {
    const owner = await createUser({ role: "partenaire", partnerRating: { noteMoyenne: 5, nombreAvis: 3 } });
    await PartnerShowroom.create({ partnerId: owner._id, companyName: "Alpha Motors", isPublished: true });

    const { req, res } = mockReqRes({ params: { id: owner._id.toString() } });
    await getPublicShowroom(req, res);

    expect(res.body.partnerInfo.partnerRating.noteMoyenne).toBe(5);
    expect(res.body.partnerInfo.partnerRating.nombreAvis).toBe(3);
  });
});
