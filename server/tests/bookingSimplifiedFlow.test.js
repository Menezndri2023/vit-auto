import { describe, it, expect } from "vitest";
import { updateBookingStatus } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test" };

// Simplification des parcours partenaire (2026-09) : l'étape "Commencer la
// préparation" a été retirée des deux parcours location — elle ne faisait que
// déplacer un statut sans action métier. Le partenaire passe donc directement
// d'une réservation acceptée à "véhicule prêt" (agence) ou "en livraison"
// (domicile). "preparing" reste une transition valide pour ne pas bloquer les
// réservations déjà à ce statut, et pour les parcours qui s'en servent
// réellement (chauffeur, leasing).
describe("bookingController.updateBookingStatus — parcours location simplifiés", () => {
  async function makeConfirmedBooking(overrides = {}) {
    const owner   = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await Booking.create({
      type: "location", status: "confirmed", vehicle: vehicle._id, clientInfo,
      adminValidation: { status: "approved" },
      location: {
        startDate: new Date(Date.now() + 86400000),
        endDate:   new Date(Date.now() + 3 * 86400000),
        days: 2, pickupMethod: "retrait",
      },
      ...overrides,
    });
    return { owner, vehicle, booking };
  }

  it("agence : passe directement d'acceptée à 'véhicule prêt', sans étape de préparation", async () => {
    const { owner, booking } = await makeConfirmedBooking();

    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() }, body: { status: "ready" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).not.toBe(409);

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("ready");
  });

  it("agence : 'prêt' mène directement à la remise au client", async () => {
    const { owner, booking } = await makeConfirmedBooking({ status: "ready" });

    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() }, body: { status: "client_arrived" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).not.toBe(409);

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("client_arrived");
  });

  it("livraison : passe directement d'acceptée à 'en livraison' (déjà autorisé avant)", async () => {
    const { owner, booking } = await makeConfirmedBooking({
      location: {
        startDate: new Date(Date.now() + 86400000),
        endDate:   new Date(Date.now() + 3 * 86400000),
        days: 2, pickupMethod: "livraison",
      },
    });

    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() }, body: { status: "in_progress" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).not.toBe(409);

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("in_progress");
  });

  it("garde 'preparing' valide : une réservation déjà à ce statut continue d'avancer", async () => {
    const { owner, booking } = await makeConfirmedBooking({ status: "preparing" });

    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() }, body: { status: "ready" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).not.toBe(409);

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("ready");
  });

  it("n'autorise toujours pas de sauter la remise au client (confirmed → transaction)", async () => {
    const { owner, booking } = await makeConfirmedBooking();

    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() }, body: { status: "waiting_client_validation" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(409);

    const unchanged = await Booking.findById(booking._id);
    expect(unchanged.status).toBe("confirmed");
  });
});
