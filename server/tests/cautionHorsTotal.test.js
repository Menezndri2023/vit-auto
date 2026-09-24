import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// LA CAUTION NE FAIT PAS PARTIE DU MONTANT DE LA RÉSERVATION
// ═══════════════════════════════════════════════════════════════════════════
// Règle de l'exploitant (2026-09-24) : la caution d'une location se règle
// DIRECTEMENT au partenaire, à la remise du véhicule. Elle n'est ni encaissée
// par la plateforme, ni additionnée au total, ni commissionnable.
//
// Rien ne le garantissait : `booking.create.test.js` vérifiait le MONTANT de la
// caution, jamais son exclusion. Or c'est exactement le genre de règle qu'une
// évolution de la tarification réintroduit sans le vouloir — et l'erreur est
// grosse, la caution valant souvent plusieurs fois le prix de la location.

// Même appareillage que booking.create.test.js : toute location exige un client
// vérifié ET une pièce d'identité + un permis (eligibilityEngine).
const FAKE_DOC_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };
const bookingDocuments = {
  identity: { type: "cni", frontImage: FAKE_DOC_IMAGE },
  license:  { frontImage: FAKE_DOC_IMAGE },
};

const clientVerifie = () => createUser({ role: "client", emailVerified: true });

// Les dates font foi : le serveur recalcule la durée et ignore le `days` du
// client (vérifié au passage — un `days` menteur ne change pas le total).
const reserver = async (vehicle, client, jours = 3, extra = {}) => {
  const debut = new Date("2027-03-01T00:00:00.000Z");
  const fin = new Date(debut.getTime() + jours * 86400000);
  const { req, res } = mockReqRes({
    user: client,
    body: {
      type: "location", clientInfo, documents: bookingDocuments,
      vehicleId: vehicle._id.toString(),
      location: { days: jours, startDate: debut.toISOString().slice(0, 10), endDate: fin.toISOString().slice(0, 10) },
      ...extra,
    },
  });
  await createBooking(req, res);
  return res;
};

describe("Caution de location — hors du montant de la réservation", () => {
  it("le total vaut le prix de la location, la caution reste à côté", async () => {
    const client = await clientVerifie();
    const vehicle = await createVehicleDoc({ pricePerDay: 10000, caution: 250000 });

    const res = await reserver(vehicle, client, 3);
    const b = res.body.booking;

    expect(b.montantBase).toBe(30000);
    expect(b.cautionAmount).toBe(250000);
    // LE point : la caution — 8 fois le prix de la location ici — n'entre pas
    // dans ce que le client doit à la réservation.
    expect(b.montantTotal).toBe(30000);
    expect(b.montantTotal).toBeLessThan(b.cautionAmount);
  });

  it("une caution énorme ne gonfle ni la commission ni le reversement", async () => {
    const client = await clientVerifie();
    const vehicle = await createVehicleDoc({ pricePerDay: 10000, caution: 1000000 });

    const b = (await reserver(vehicle, client, 2)).body.booking;

    expect(b.montantTotal).toBe(20000);
    // La commission se calcule sur le total : si la caution y était entrée,
    // la plateforme prélèverait une commission sur l'argent d'un dépôt de
    // garantie qu'elle n'encaisse même pas.
    expect(b.commissionAmount).toBeLessThanOrEqual(b.montantTotal);
    expect(b.commissionAmount).toBe(Math.round(b.montantTotal * b.commissionRate * 100) / 100);
    expect(b.partnerPayout).toBeLessThanOrEqual(b.montantTotal);
  });

  it("un véhicule sans caution se réserve au même total", async () => {
    const client = await clientVerifie();
    const vehicle = await createVehicleDoc({ pricePerDay: 10000, caution: 0 });

    const b = (await reserver(vehicle, client, 3)).body.booking;
    expect(b.cautionAmount).toBe(0);
    expect(b.montantTotal).toBe(30000);
  });

  it("la caution vient du véhicule, jamais du client", async () => {
    const client = await clientVerifie();
    const vehicle = await createVehicleDoc({ pricePerDay: 10000, caution: 50000 });

    // Un client qui poserait sa propre caution pourrait s'en dispenser.
    const res = await reserver(vehicle, client, 3, { cautionAmount: 1 });
    expect(res.body.booking.cautionAmount).toBe(50000);
  });
});
