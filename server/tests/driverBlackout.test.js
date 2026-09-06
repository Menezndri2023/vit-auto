import { describe, it, expect } from "vitest";
import { addDriverBlackout, removeDriverBlackout } from "../controllers/driverController.js";
import { createBooking } from "../controllers/bookingController.js";
import Driver from "../models/Driver.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Le partenaire n'avait jusqu'ici aucun moyen de bloquer proactivement des
// dates pour un chauffeur (congés/maladie) — seul l'historique des
// réservations existantes était visible. Manque réel trouvé en audit.
const makeDriver = async (owner) => Driver.create({
  owner: owner._id, firstName: "Jean", lastName: "Chauffeur", title: "Chauffeur pro Abidjan",
  disponibilite: "Temps plein", zone: "Abidjan", experience: "5 ans",
  tarif: 20000, status: "approved",
});

describe("driverController — congés bloqués", () => {
  it("refuse l'ajout par un tiers non propriétaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const driver = await makeDriver(owner);

    const { req, res } = mockReqRes({
      user: stranger, params: { id: driver._id.toString() },
      body: { start: "2027-01-10", end: "2027-01-15" },
    });
    await addDriverBlackout(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("refuse une période invalide (fin avant début)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const driver = await makeDriver(owner);

    const { req, res } = mockReqRes({
      user: owner, params: { id: driver._id.toString() },
      body: { start: "2027-01-15", end: "2027-01-10" },
    });
    await addDriverBlackout(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("ajoute puis supprime une période de congé", async () => {
    const owner = await createUser({ role: "partenaire" });
    const driver = await makeDriver(owner);

    const add = mockReqRes({
      user: owner, params: { id: driver._id.toString() },
      body: { start: "2027-01-10", end: "2027-01-15", reason: "Congés" },
    });
    await addDriverBlackout(add.req, add.res);
    expect(add.res.statusCode).toBe(201);
    expect(add.res.body.driver.blackoutDates).toHaveLength(1);
    const blackoutId = add.res.body.driver.blackoutDates[0]._id.toString();

    const remove = mockReqRes({ user: owner, params: { id: driver._id.toString(), blackoutId } });
    await removeDriverBlackout(remove.req, remove.res);
    expect(remove.res.statusCode).toBe(200);
    expect(remove.res.body.driver.blackoutDates).toHaveLength(0);
  });

  it("bloque une réservation chauffeur sur une période de congé", async () => {
    const owner = await createUser({ role: "partenaire" });
    const driver = await makeDriver(owner);
    driver.blackoutDates.push({ start: new Date("2027-02-10"), end: new Date("2027-02-15"), reason: "Congés" });
    await driver.save();

    const client = await createUser({ role: "client", emailVerified: true });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "chauffeur",
        clientInfo: { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" },
        // Restructuration réservation (2026-09) : identité exigée pour réserver
        // un chauffeur professionnel — voir booking.create.test.js.
        documents: { identity: { type: "cni", frontImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" } },
        driverId: driver._id.toString(),
        chauffeur: { date: "2027-02-12T09:00:00.000Z", heures: 2 },
      },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(409);
  });
});
