import { describe, it, expect } from "vitest";
import { adminListBusinesses, adminUpdateRentalPolicy } from "../controllers/partnerBusinessController.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Restructuration frais de livraison (2026-09) : la politique de location
// (dont les frais de livraison "même ville") reste réglable par le
// partenaire, mais l'admin doit pouvoir consulter/ajuster n'importe quelle
// entité — aucune route n'existait jusqu'ici.
describe("partnerBusinessController — supervision admin de la politique de location", () => {
  it("liste les entreprises, filtrables par nom", async () => {
    const owner = await createUser({ role: "partenaire" });
    await makeTestPartnerBusiness(owner._id, { companyName: "Location Express Abidjan" });
    await makeTestPartnerBusiness(owner._id, { companyName: "Autre Entreprise" });

    const { req, res } = mockReqRes({ query: { search: "Express" } });
    await adminListBusinesses(req, res);
    expect(res.body.businesses).toHaveLength(1);
    expect(res.body.businesses[0].companyName).toBe("Location Express Abidjan");
  });

  it("un admin peut fixer le tarif de livraison même ville d'une entité, quel qu'en soit le propriétaire", async () => {
    const admin  = await createUser({ role: "admin" });
    const owner  = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(owner._id);

    const { req, res } = mockReqRes({
      params: { id: business._id.toString() }, user: admin,
      body: { rentalPolicy: { deliveryFeeSameCity: 130, deliverySameCityRadiusKm: 20 } },
    });
    await adminUpdateRentalPolicy(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(404);

    const updated = await PartnerBusiness.findById(business._id);
    expect(updated.rentalPolicy.deliveryFeeSameCity).toBe(130);
    expect(updated.rentalPolicy.deliverySameCityRadiusKm).toBe(20);
  });

  it("ne touche jamais les champs de rentalPolicy non transmis", async () => {
    const admin = await createUser({ role: "admin" });
    const owner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(owner._id, {
      rentalPolicy: { minimumAge: 25, deliveryFeeSameCity: 100 },
    });

    const { req, res } = mockReqRes({
      params: { id: business._id.toString() }, user: admin,
      body: { rentalPolicy: { deliveryFeeSameCity: 150 } },
    });
    await adminUpdateRentalPolicy(req, res);

    const updated = await PartnerBusiness.findById(business._id);
    expect(updated.rentalPolicy.deliveryFeeSameCity).toBe(150);
    expect(updated.rentalPolicy.minimumAge).toBe(25);
  });
});
