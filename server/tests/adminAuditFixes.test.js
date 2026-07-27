import { describe, it, expect } from "vitest";
import { updateBookingStatus, validateTransaction, resolveDispute, respondToDispute } from "../controllers/bookingController.js";
import { getHero, updateHero } from "../controllers/siteContentController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

async function makeBooking(overrides = {}) {
  const client  = await createUser({ role: "client" });
  const partner = await createUser({ role: "partenaire" });
  const vehicle = await createVehicleDoc({ owner: partner._id });
  const booking = await Booking.create({
    type: "location", status: "confirmed", client: client._id, clientInfo,
    vehicle: vehicle._id,
    location: { startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), days: 2 },
    montantBase: 20000, montantTotal: 20000, commissionRate: 0.15, commissionAmount: 3000, partnerPayout: 17000,
    ...overrides,
  });
  return { client, partner, vehicle, booking };
}

// Bug réel corrigé (audit) : "cancelled" n'était pas une transition autorisée
// depuis client_arrived/waiting_client_validation — une réservation bloquée
// dans ces états ne pouvait JAMAIS être annulée, ni par le partenaire ni par
// l'admin. Un admin garde désormais un droit d'annulation d'urgence même hors
// machine à états ; un partenaire, non.
describe("updateBookingStatus — annulation d'urgence admin hors machine à états", () => {
  it("un admin peut annuler depuis client_arrived (transition normalement invalide)", async () => {
    const { booking } = await makeBooking({ status: "client_arrived" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: booking._id.toString() },
      body: { status: "cancelled", cancelReasonCode: "autre" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
    const reloaded = await Booking.findById(booking._id);
    expect(reloaded.status).toBe("cancelled");
    expect(reloaded.cancelledBy).toBe("admin");
  });

  it("un partenaire NE PEUT PAS annuler depuis client_arrived (pas de passe-droit hors admin)", async () => {
    const { booking, partner } = await makeBooking({ status: "client_arrived" });
    const { req, res } = mockReqRes({
      user: partner, params: { id: booking._id.toString() },
      body: { status: "cancelled", cancelReasonCode: "autre" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("un admin peut annuler depuis waiting_client_validation", async () => {
    const { booking } = await makeBooking({ status: "waiting_client_validation" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: booking._id.toString() },
      body: { status: "cancelled", cancelReasonCode: "autre" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("validateTransaction — notification admin à l'ouverture d'un litige", () => {
  it("notifie tous les admins (pas seulement le partenaire) quand le client conteste", async () => {
    const admin1 = await createUser({ role: "admin" });
    const admin2 = await createUser({ role: "admin" });
    const { booking, client } = await makeBooking({ status: "waiting_client_validation" });
    const { req, res } = mockReqRes({
      user: client, params: { id: booking._id.toString() },
      body: { action: "dispute", disputeReason: "Véhicule non conforme" },
    });
    await validateTransaction(req, res);
    expect(res.statusCode).toBe(200);

    const Notification = (await import("../models/Notification.js")).default;
    const adminNotifs = await Notification.find({ user: { $in: [admin1._id, admin2._id] } });
    expect(adminNotifs).toHaveLength(2);
    expect(adminNotifs[0].titre).toMatch(/litige/i);
  });
});

describe("resolveDispute — signal refund_needed sur compensation", () => {
  it("émet refund_needed vers la room 'admins' quand refundClient=true", async () => {
    const { booking } = await makeBooking({ status: "disputed" });
    const admin = await createUser({ role: "admin" });
    const emitted = [];
    global._io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
    try {
      const { req, res } = mockReqRes({
        user: admin, params: { id: booking._id.toString() },
        body: { resolution: "compensated", note: "Remboursement partiel accordé", refundClient: true },
      });
      await resolveDispute(req, res);
      expect(res.statusCode).toBe(200);

      const refundEvents = emitted.filter((e) => e.event === "refund_needed");
      expect(refundEvents).toHaveLength(1);
      expect(refundEvents[0].room).toBe("admins");
    } finally {
      delete global._io;
    }
  });

  it("n'émet rien si refundClient n'est pas demandé (résolution 'completed')", async () => {
    const { booking } = await makeBooking({ status: "disputed" });
    const admin = await createUser({ role: "admin" });
    const emitted = [];
    global._io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
    try {
      const { req, res } = mockReqRes({
        user: admin, params: { id: booking._id.toString() },
        body: { resolution: "completed", note: "Service rendu conforme" },
      });
      await resolveDispute(req, res);
      expect(emitted.filter((e) => e.event === "refund_needed")).toHaveLength(0);
    } finally {
      delete global._io;
    }
  });
});

// Bug réel corrigé (audit) : un partenaire en litige n'avait strictement
// aucun moyen d'apporter des éléments avant que l'admin ne tranche
// (resolveDispute) — simple spectateur passif, renvoyé vers "contactez le
// support" hors plateforme.
describe("respondToDispute — le partenaire peut répondre avant la décision admin", () => {
  it("un partenaire peut répondre à un litige sur SA commande", async () => {
    const { booking, partner } = await makeBooking({ status: "disputed" });
    const { req, res } = mockReqRes({
      user: partner, params: { id: booking._id.toString() },
      body: { message: "Le véhicule était en parfait état à la remise, voici mon explication." },
    });
    await respondToDispute(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Booking.findById(booking._id);
    expect(reloaded.partnerDisputeResponse.message).toMatch(/parfait état/);
    expect(reloaded.partnerDisputeResponse.respondedAt).toBeTruthy();
  });

  it("refuse un message vide", async () => {
    const { booking, partner } = await makeBooking({ status: "disputed" });
    const { req, res } = mockReqRes({ user: partner, params: { id: booking._id.toString() }, body: { message: "  " } });
    await respondToDispute(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse un autre partenaire que le propriétaire de la commande", async () => {
    const { booking } = await makeBooking({ status: "disputed" });
    const other = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: other, params: { id: booking._id.toString() }, body: { message: "Réponse" } });
    await respondToDispute(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("refuse si la commande n'est pas en litige", async () => {
    const { booking, partner } = await makeBooking({ status: "confirmed" });
    const { req, res } = mockReqRes({ user: partner, params: { id: booking._id.toString() }, body: { message: "Réponse" } });
    await respondToDispute(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("notifie tous les admins de la réponse", async () => {
    const admin1 = await createUser({ role: "admin" });
    const admin2 = await createUser({ role: "admin" });
    const { booking, partner } = await makeBooking({ status: "disputed" });
    const { req, res } = mockReqRes({ user: partner, params: { id: booking._id.toString() }, body: { message: "Ma réponse" } });
    await respondToDispute(req, res);
    expect(res.statusCode).toBe(200);

    const Notification = (await import("../models/Notification.js")).default;
    const adminNotifs = await Notification.find({ user: { $in: [admin1._id, admin2._id] } });
    expect(adminNotifs).toHaveLength(2);
  });
});

// Bug réel corrigé (audit) : le contenu hero (titre/sous-titre/carrousel) de
// la page d'accueil n'était persisté qu'en localStorage du navigateur admin
// — aucun visiteur réel ne le voyait jamais. Voir server/models/SiteContent.js.
describe("siteContentController — hero", () => {
  it("getHero renvoie des valeurs par défaut vides si rien n'a jamais été configuré", async () => {
    const { req, res } = mockReqRes({});
    await getHero(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.heroTitle).toBe("");
    expect(res.body.heroSpotlights).toEqual([]);
  });

  it("updateHero persiste le titre/sous-titre, relu ensuite par getHero (visible de tous)", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, body: { heroTitle: "Louez malin en Afrique", heroSubtitle: "Sous-titre de test" },
    });
    await updateHero(req, res);
    expect(res.statusCode).toBe(200);

    const { req: req2, res: res2 } = mockReqRes({});
    await getHero(req2, res2);
    expect(res2.body.heroTitle).toBe("Louez malin en Afrique");
    expect(res2.body.heroSubtitle).toBe("Sous-titre de test");
  });

  it("rejette un heroSpotlights qui n'est pas un tableau", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, body: { heroSpotlights: "not-an-array" } });
    await updateHero(req, res);
    expect(res.statusCode).toBe(400);
  });
});
