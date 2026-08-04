import { describe, it, expect } from "vitest";
import { addActivityBlackout, removeActivityBlackout, transferActivity } from "../controllers/activityController.js";
import { createBooking } from "../controllers/bookingController.js";
import { createUser, createActivityDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

describe("activityController — congés bloqués", () => {
  it("refuse l'ajout par un tiers non propriétaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const activity = await createActivityDoc({ owner: owner._id });

    const { req, res } = mockReqRes({
      user: stranger, params: { id: activity._id.toString() },
      body: { start: "2027-01-10", end: "2027-01-15" },
    });
    await addActivityBlackout(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("refuse une période invalide (fin avant début)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const activity = await createActivityDoc({ owner: owner._id });

    const { req, res } = mockReqRes({
      user: owner, params: { id: activity._id.toString() },
      body: { start: "2027-01-15", end: "2027-01-10" },
    });
    await addActivityBlackout(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("ajoute puis supprime une période de congé", async () => {
    const owner = await createUser({ role: "partenaire" });
    const activity = await createActivityDoc({ owner: owner._id });

    const add = mockReqRes({
      user: owner, params: { id: activity._id.toString() },
      body: { start: "2027-01-10", end: "2027-01-15", reason: "Maintenance" },
    });
    await addActivityBlackout(add.req, add.res);
    expect(add.res.statusCode).toBe(201);
    expect(add.res.body.activity.blackoutDates).toHaveLength(1);
    const blackoutId = add.res.body.activity.blackoutDates[0]._id.toString();

    const remove = mockReqRes({ user: owner, params: { id: activity._id.toString(), blackoutId } });
    await removeActivityBlackout(remove.req, remove.res);
    expect(remove.res.statusCode).toBe(200);
    expect(remove.res.body.activity.blackoutDates).toHaveLength(0);
  });

  it("bloque une réservation d'activité sur une période de congé", async () => {
    const owner = await createUser({ role: "partenaire" });
    const activity = await createActivityDoc({ owner: owner._id, capacity: 4 });
    activity.blackoutDates.push({ start: new Date("2027-02-10"), end: new Date("2027-02-15"), reason: "Maintenance" });
    await activity.save();

    const { req, res } = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-02-12T09:00:00.000Z", participants: 1 },
      },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(409);
  });
});

describe("activityController.transferActivity (admin)", () => {
  it("transfère la propriété vers un autre partenaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const newOwner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const activity = await createActivityDoc({ owner: owner._id });

    const { req, res } = mockReqRes({
      user: admin, params: { id: activity._id.toString() },
      body: { ownerId: newOwner._id.toString() },
    });
    await transferActivity(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.activity.owner.toString()).toBe(newOwner._id.toString());
  });

  it("refuse un compte destinataire qui n'est pas partenaire/admin", async () => {
    const owner = await createUser({ role: "partenaire" });
    const client = await createUser({ role: "client" });
    const admin = await createUser({ role: "admin" });
    const activity = await createActivityDoc({ owner: owner._id });

    const { req, res } = mockReqRes({
      user: admin, params: { id: activity._id.toString() },
      body: { ownerId: client._id.toString() },
    });
    await transferActivity(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse une requête sans aucun changement", async () => {
    const owner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const activity = await createActivityDoc({ owner: owner._id });

    const { req, res } = mockReqRes({
      user: admin, params: { id: activity._id.toString() }, body: {},
    });
    await transferActivity(req, res);
    expect(res.statusCode).toBe(400);
  });
});
