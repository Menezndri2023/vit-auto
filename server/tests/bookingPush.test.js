import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";

// Modèles de message push dédiés (Booking Engine, 2026-09) — voir
// templates/push/BookingPush.js. On mocke sendViaInternal (CommunicationService)
// pour capturer pushTitle/pushBody sans dépendre de Redis/BullMQ ni d'un vrai
// appel FCM — même pattern que pushNotification.test.js.
const sendViaInternalMock = vi.fn().mockResolvedValue({ sent: true });
vi.mock("../services/communication/CommunicationService.js", () => ({
  sendViaInternal: (...args) => sendViaInternalMock(...args),
  sendViaEmail:    vi.fn().mockResolvedValue({ sent: true }),
  sendViaSms:      vi.fn().mockResolvedValue({ sent: true }),
  sendViaWhatsApp: vi.fn().mockResolvedValue({ sent: true }),
}));

const { dispatch } = await import("../queue/index.js");
const { newBookingClientPush, newBookingPartnerPush, bookingConfirmedClientPush } = await import("../services/communication/templates/push/BookingPush.js");

function fakeId() { return new mongoose.Types.ObjectId(); }

describe("Modèles de message push — cycle de vie réservation", () => {
  // bookingCreated enqueue 2 jobs NOTIFICATION en parallèle (Promise.allSettled)
  // quand client ET partenaire sont présents — sous Vitest, la première
  // résolution concurrente d'imports dynamiques imbriqués sur un module mocké
  // peut incohéremment retomber sur le vrai module pour l'un des deux appels
  // (artefact de test, pas un bug de code : les deux imports pointent le même
  // module en production, sans mock impliqué). On isole donc chaque branche
  // dans son propre appel (un seul job NOTIFICATION à la fois, jamais de
  // concurrence), en désactivant l'autre via des guards déjà présents dans
  // bookingCreated (`client?._id` / `vehicle?.owner?._id`).
  it("dispatch.bookingCreated transmet un push dédié au client", async () => {
    sendViaInternalMock.mockClear();
    const clientId = fakeId();
    const booking  = { _id: fakeId(), reference: "VA-TEST-001", montantTotal: 100 };
    const client   = { _id: clientId, firstName: "Jean", email: "jean@example.test" };
    const vehicle  = { title: "Toyota Corolla" }; // pas de owner → branche partenaire désactivée

    await dispatch.bookingCreated(booking, client, vehicle);

    expect(sendViaInternalMock).toHaveBeenCalledTimes(1);
    const payload = sendViaInternalMock.mock.calls[0][0];
    const expected = newBookingClientPush({ reference: "VA-TEST-001", vehicleTitle: "Toyota Corolla" });
    expect(payload.userId).toBe(clientId.toString());
    expect(payload.pushTitle).toBe(expected.title);
    expect(payload.pushBody).toBe(expected.body);
  });

  it("dispatch.bookingCreated transmet un push dédié au partenaire", async () => {
    sendViaInternalMock.mockClear();
    const ownerId  = fakeId();
    const booking  = { _id: fakeId(), reference: "VA-TEST-001b", montantTotal: 100 };
    const vehicle  = { title: "Toyota Corolla", owner: { _id: ownerId, phone: null } };

    await dispatch.bookingCreated(booking, null, vehicle); // pas de client → branche client désactivée

    expect(sendViaInternalMock).toHaveBeenCalledTimes(1);
    const payload = sendViaInternalMock.mock.calls[0][0];
    const expected = newBookingPartnerPush({ reference: "VA-TEST-001b", clientName: undefined, vehicleTitle: "Toyota Corolla" });
    expect(payload.userId).toBe(ownerId.toString());
    expect(payload.pushTitle).toBe(expected.title);
    expect(payload.pushBody).toBe(expected.body);
  });

  it("dispatch.bookingStatusChanged('confirmed') transmet un push dédié au client", async () => {
    sendViaInternalMock.mockClear();
    const clientId = fakeId();
    const booking  = { _id: fakeId(), reference: "VA-TEST-002" };
    const client   = { _id: clientId, firstName: "Awa", email: "awa@example.test" };
    const vehicle  = { title: "Hyundai Tucson" };

    await dispatch.bookingStatusChanged(booking, client, vehicle, "confirmed");

    expect(sendViaInternalMock).toHaveBeenCalledTimes(1);
    const payload = sendViaInternalMock.mock.calls[0][0];
    const expected = bookingConfirmedClientPush({ reference: "VA-TEST-002", vehicleTitle: "Hyundai Tucson" });
    expect(payload.pushTitle).toBe(expected.title);
    expect(payload.pushBody).toBe(expected.body);
    expect(payload.skipEmail).toBe(true);
  });

  it("dispatch.bookingStatusChanged('cancelled') n'a pas de push dédié (repli sur le texte in-app)", async () => {
    sendViaInternalMock.mockClear();
    const clientId = fakeId();
    const booking  = { _id: fakeId(), reference: "VA-TEST-003" };
    const client   = { _id: clientId, firstName: "Awa", email: "awa@example.test" };
    const vehicle  = { title: "Hyundai Tucson" };

    await dispatch.bookingStatusChanged(booking, client, vehicle, "cancelled");

    expect(sendViaInternalMock).toHaveBeenCalledTimes(1);
    const payload = sendViaInternalMock.mock.calls[0][0];
    expect(payload.pushTitle).toBeUndefined();
    expect(payload.pushBody).toBeUndefined();
    expect(payload.skipEmail).toBe(false);
  });
});
