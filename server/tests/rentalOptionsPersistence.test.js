import { describe, it, expect } from "vitest";
import { updateBusiness } from "../controllers/partnerBusinessController.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { resolveRentalOptions } from "../services/rentalOptions.js";

// Persistance des options du partenaire — le maillon qui casse en silence.
//
// Ce dépôt a un antécédent précis : un champ absent du schéma Mongoose, ou
// absent d'une liste blanche de contrôleur, est ignoré SANS ERREUR. Le
// formulaire affiche « enregistré », et le réglage n'existe pas. C'est ainsi
// que Vehicle.featured est resté mort pendant des mois.
//
// Ces tests suivent donc le réglage jusqu'en base, puis jusqu'au service qui
// tarife — pas seulement jusqu'à la réponse HTTP.

describe("Options du partenaire — persistance jusqu'au calcul du prix", () => {
  it("un refus d'option enregistré par le partenaire arrive jusqu'en base", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partenaire._id);

    const { req, res } = mockReqRes({
      user: partenaire,
      params: { id: business._id.toString() },
      body: {
        rentalPolicy: {
          rentalOptions: { driver: { offered: false, pricePerDay: null } },
        },
      },
    });
    await updateBusiness(req, res);

    const relu = await PartnerBusiness.findById(business._id).lean();
    expect(relu.rentalPolicy?.rentalOptions?.driver?.offered,
      "le refus doit être enregistré, pas ignoré en silence").toBe(false);
  });

  it("un tarif partenaire enregistré est bien celui qui sera facturé", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partenaire._id);

    const { req, res } = mockReqRes({
      user: partenaire,
      params: { id: business._id.toString() },
      body: {
        rentalPolicy: {
          rentalOptions: { driver: { offered: true, pricePerDay: 150 } },
        },
      },
    });
    await updateBusiness(req, res);

    // Le chemin complet : base → service de résolution → prix facturé.
    const relu = await PartnerBusiness.findById(business._id).lean();
    const options = await resolveRentalOptions(relu.rentalPolicy);
    const chauffeur = options.find((o) => o.id === "driver");

    expect(chauffeur.pricePerDay).toBe(150);
    expect(chauffeur.source).toBe("partenaire");
  });

  it("un partenaire ne peut pas modifier l'entité d'un autre", async () => {
    const proprietaire = await createUser({ role: "partenaire" });
    const intrus       = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(proprietaire._id);

    const { req, res } = mockReqRes({
      user: intrus,
      params: { id: business._id.toString() },
      body: { rentalPolicy: { rentalOptions: { driver: { offered: false } } } },
    });
    await updateBusiness(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const relu = await PartnerBusiness.findById(business._id).lean();
    expect(relu.rentalPolicy?.rentalOptions?.driver?.offered ?? null).toBeNull();
  });
});
