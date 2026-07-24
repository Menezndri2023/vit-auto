import { describe, it, expect } from "vitest";
import { claimCaution } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Bug réel trouvé en audit : cautionAmount était perçu et affiché mais jamais
// réellement traité — le contrat promet "prélevé sur la caution en cas de
// dommage" sans qu'aucun outil ne permette au partenaire de retenir/restituer
// quoi que ce soit après la location. Voir bookingController.claimCaution.
const makeCompletedLocationBooking = async (overrides = {}) => {
  const owner = await createUser({ role: "partenaire", isFounder: true });
  const client = await createUser();
  const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 15000, caution: 50000 });
  const booking = await Booking.create({
    type: "location",
    status: "completed",
    client: client._id,
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" },
    vehicle: vehicle._id,
    cautionAmount: 50000,
    devise: "USD",
    reference: "VIT-LOC-TEST-001",
    ...overrides,
  });
  return { owner, client, vehicle, booking };
};

describe("bookingController.claimCaution", () => {
  it("refuse un rôle non propriétaire", async () => {
    const { booking } = await makeCompletedLocationBooking();
    const stranger = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: stranger, params: { id: booking._id.toString() }, body: { amountClaimed: 0 } });
    await claimCaution(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("refuse si la location n'est pas terminée", async () => {
    const { owner, booking } = await makeCompletedLocationBooking({ status: "in_progress" });
    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { amountClaimed: 0 } });
    await claimCaution(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("refuse une retenue sans motif", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { amountClaimed: 10000 } });
    await claimCaution(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse un montant supérieur à la caution perçue", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { amountClaimed: 999999, reason: "Dommage" } });
    await claimCaution(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("restitue intégralement la caution (aucun dommage)", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { amountClaimed: 0 } });
    await claimCaution(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await Booking.findById(booking._id);
    expect(saved.cautionClaim.amountClaimed).toBe(0);
    expect(saved.cautionClaim.claimedAt).toBeTruthy();
  });

  it("retient une partie de la caution avec motif", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() }, body: { amountClaimed: 20000, reason: "Pare-choc endommagé" },
    });
    await claimCaution(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await Booking.findById(booking._id);
    expect(saved.cautionClaim.amountClaimed).toBe(20000);
    expect(saved.cautionClaim.reason).toBe("Pare-choc endommagé");
  });

  it("refuse un second traitement de la même caution", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const first = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { amountClaimed: 0 } });
    await claimCaution(first.req, first.res);

    const second = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { amountClaimed: 0 } });
    await claimCaution(second.req, second.res);
    expect(second.res.statusCode).toBe(409);
  });
});
