import { describe, it, expect } from "vitest";
import { autoApproveBooking } from "../services/bookingActionService.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" };

async function makePendingBooking({ ownerOverrides = {}, clientOverrides = {} } = {}) {
  const owner  = await createUser({ role: "partenaire", ...ownerOverrides });
  const client = await createUser({ role: "client", ...clientOverrides });
  const vehicle = await createVehicleDoc({ owner: owner._id });
  const booking = await Booking.create({
    type: "location", vehicle: vehicle._id, client: client._id, clientInfo,
    status: "pending", adminValidation: { status: "pending" },
    location: { startDate: new Date(Date.now() + 86400000), endDate: new Date(Date.now() + 3 * 86400000), days: 2 },
    montantTotal: 200,
  });
  return { owner, client, vehicle, booking };
}

describe("Auto-acceptation partenaire pour client fiable", () => {
  it("confirme automatiquement quand le partenaire a activé le réglage et le client dépasse les seuils", async () => {
    const { owner, booking } = await makePendingBooking({
      ownerOverrides: { autoAcceptTrustedClients: { enabled: true, minRating: 4, minReviews: 2 } },
      clientOverrides: { clientReliability: { noteMoyenne: 4.5, nombreAvis: 3 } },
    });

    await autoApproveBooking({ bookingId: booking._id.toString(), riskLevel: "low", flags: [] });

    const updated = await Booking.findById(booking._id);
    expect(updated.adminValidation.status).toBe("approved");
    expect(updated.status).toBe("confirmed");
    void owner;
  });

  it("ne confirme pas automatiquement si le partenaire n'a pas activé le réglage", async () => {
    const { booking } = await makePendingBooking({
      ownerOverrides: { autoAcceptTrustedClients: { enabled: false } },
      clientOverrides: { clientReliability: { noteMoyenne: 5, nombreAvis: 10 } },
    });

    await autoApproveBooking({ bookingId: booking._id.toString(), riskLevel: "low", flags: [] });

    const updated = await Booking.findById(booking._id);
    expect(updated.adminValidation.status).toBe("approved");
    expect(updated.status).toBe("pending"); // toujours en attente du partenaire
  });

  it("ne confirme pas automatiquement si la note du client est sous le seuil", async () => {
    const { booking } = await makePendingBooking({
      ownerOverrides: { autoAcceptTrustedClients: { enabled: true, minRating: 4.5, minReviews: 1 } },
      clientOverrides: { clientReliability: { noteMoyenne: 4, nombreAvis: 5 } },
    });

    await autoApproveBooking({ bookingId: booking._id.toString(), riskLevel: "low", flags: [] });

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("pending");
  });

  it("ne confirme pas automatiquement si le client n'a pas assez d'avis", async () => {
    const { booking } = await makePendingBooking({
      ownerOverrides: { autoAcceptTrustedClients: { enabled: true, minRating: 4, minReviews: 3 } },
      clientOverrides: { clientReliability: { noteMoyenne: 5, nombreAvis: 1 } },
    });

    await autoApproveBooking({ bookingId: booking._id.toString(), riskLevel: "low", flags: [] });

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("pending");
  });

  it("ne confirme pas automatiquement un client jamais noté (clientReliability par défaut)", async () => {
    const { booking } = await makePendingBooking({
      ownerOverrides: { autoAcceptTrustedClients: { enabled: true, minRating: 4, minReviews: 1 } },
    });

    await autoApproveBooking({ bookingId: booking._id.toString(), riskLevel: "medium", flags: ["test"] });

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("pending");
  });
});
