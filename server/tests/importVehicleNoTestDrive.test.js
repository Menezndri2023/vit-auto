import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// UN VÉHICULE À L'IMPORT NE S'ESSAIE PAS.
//
// Neuf véhicules situés en Chine figuraient au catalogue en `type: "vente"`, ce
// qui ouvrait une réservation de type ESSAI — un rendez-vous d'essai pour une
// voiture qui se trouve à Shanghai. Le client prenait rendez-vous, le
// partenaire recevait une demande impossible à honorer, et personne ne le
// découvrait avant l'échange de messages.
//
// La règle porte sur le PAYS, jamais sur ces neuf annonces : toute annonce
// future venue d'un pays d'origine d'import est couverte sans nouvelle
// intervention. Le second test est le plus important — c'est la DISTANCE qui
// rend l'essai absurde, pas la nationalité du véhicule : un véhicule situé dans
// le pays du client reste parfaitement essayable, y compris en Chine pour un
// client chinois.

const demain = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};

async function demandeEssai({ paysVehicule, paysClient }) {
  const owner  = await createUser({ role: "partenaire" });
  const client = await createUser({ role: "client", country: paysClient, emailVerified: true });
  const vehicle = await createVehicleDoc({
    owner: owner._id, status: "approved", type: "vente",
    country: paysVehicule, priceForSale: 20000,
  });

  const { req, res } = mockReqRes({
    user: client,
    body: {
      type: "essai",
      vehicleId: vehicle._id.toString(),
      essai: { preferredDate: demain(), preferredTime: "10:00" },
      clientInfo: { firstName: "Awa", lastName: "Traoré", email: "awa@test.dev", phone: "+2250700000000" },
    },
  });
  await createBooking(req, res);
  return res;
}

describe("Essai refusé sur un véhicule à l'import", () => {
  it("un client marocain ne peut pas demander l'essai d'un véhicule en Chine", async () => {
    const res = await demandeEssai({ paysVehicule: "CN", paysClient: "MA" });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe("IMPORT_VEHICLE_NO_TEST_DRIVE");
    expect(res.body.message, "le client doit comprendre quoi faire à la place")
      .toMatch(/s'achète à l'import/i);
  });

  it("un client CHINOIS peut essayer ce même véhicule — c'est la distance qui compte", async () => {
    // Le test qui empêche la règle de devenir une interdiction absurde : rien
    // ne s'oppose à ce qu'un acheteur sur place aille voir la voiture.
    const res = await demandeEssai({ paysVehicule: "CN", paysClient: "CN" });

    expect(res.body?.code).not.toBe("IMPORT_VEHICLE_NO_TEST_DRIVE");
  });

  it("un véhicule local reste essayable", async () => {
    const res = await demandeEssai({ paysVehicule: "MA", paysClient: "MA" });
    expect(res.body?.code).not.toBe("IMPORT_VEHICLE_NO_TEST_DRIVE");
  });

  it("un véhicule au Maroc reste essayable par un client ivoirien", async () => {
    // Le Maroc et la Côte d'Ivoire sont des marchés de DESTINATION, pas des
    // origines d'import : un déplacement y est plausible, contrairement à la
    // Chine ou au Japon.
    const res = await demandeEssai({ paysVehicule: "MA", paysClient: "CI" });
    expect(res.body?.code).not.toBe("IMPORT_VEHICLE_NO_TEST_DRIVE");
  });

  it("la règle vaut pour toutes les origines d'import, pas seulement la Chine", async () => {
    for (const pays of ["JP", "DE", "AE", "US", "KR"]) {
      const res = await demandeEssai({ paysVehicule: pays, paysClient: "CI" });
      expect(res.body?.code, `origine ${pays}`).toBe("IMPORT_VEHICLE_NO_TEST_DRIVE");
    }
  });
});
