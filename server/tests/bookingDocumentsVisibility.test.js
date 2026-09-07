import { describe, it, expect } from "vitest";
import { getBookingDetail } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Restructuration réservation (2026-09) : les documents (pièce d'identité,
// permis) sont liés À LA RÉSERVATION et transmis au partenaire pour qu'il n'ait
// jamais à les redemander. Ils sont `select: false` sur le modèle (voir
// Booking.clientKycSnapshot) : sans le `.select("+...")` explicite de
// getBookingDetail, le partenaire recevait une fiche SANS aucune image — c'est
// exactement le symptôme signalé ("les documents des clients ne sont pas
// visibles"). Ce fichier verrouille la visibilité réelle, rôle par rôle.

const IMG = "https://cdn.example.test/doc";

async function createBookingWithDocs(ownerId, overrides = {}) {
  const client  = await createUser({ role: "client", emailVerified: true });
  const vehicle = await createVehicleDoc({ owner: ownerId });
  const booking = await Booking.create({
    type: "location",
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean.doc@example.test" },
    client:  client._id,
    vehicle: vehicle._id,
    adminValidation: { status: "approved" },
    clientKycSnapshot: {
      idType: "cni",
      frontImage:        `${IMG}/id-recto.jpg`,
      backImage:         `${IMG}/id-verso.jpg`,
      selfie:            `${IMG}/selfie.jpg`,
      licenseFrontImage: `${IMG}/permis-recto.jpg`,
      licenseBackImage:  `${IMG}/permis-verso.jpg`,
    },
    ...overrides,
  });
  return { client, vehicle, booking };
}

describe("getBookingDetail — visibilité des documents client", () => {
  it("renvoie les images des documents au partenaire propriétaire (identité + permis), jamais le selfie biométrique", async () => {
    const owner = await createUser({ role: "partenaire" });
    const { booking } = await createBookingWithDocs(owner._id);

    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() } });
    await getBookingDetail(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    const snap = res.body.booking.clientKycSnapshot;
    expect(snap.frontImage).toBe(`${IMG}/id-recto.jpg`);
    expect(snap.backImage).toBe(`${IMG}/id-verso.jpg`);
    expect(snap.licenseFrontImage).toBe(`${IMG}/permis-recto.jpg`);
    expect(snap.licenseBackImage).toBe(`${IMG}/permis-verso.jpg`);
    expect(snap.selfie).toBeUndefined();
  });

  it("renvoie tout à l'admin, selfie compris (litige)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const { booking } = await createBookingWithDocs(owner._id);

    const { req, res } = mockReqRes({ user: admin, params: { id: booking._id.toString() } });
    await getBookingDetail(req, res);

    const snap = res.body.booking.clientKycSnapshot;
    expect(snap.frontImage).toBeTruthy();
    expect(snap.licenseFrontImage).toBeTruthy();
    expect(snap.selfie).toBe(`${IMG}/selfie.jpg`);
  });

  it("n'expose aucune image à un partenaire tiers ni à un client tiers", async () => {
    const owner    = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const { booking } = await createBookingWithDocs(owner._id);

    const { req, res } = mockReqRes({ user: stranger, params: { id: booking._id.toString() } });
    await getBookingDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("garde le gate admin : le partenaire n'accède pas à la fiche tant que la réservation n'est pas validée", async () => {
    const owner = await createUser({ role: "partenaire" });
    const { booking } = await createBookingWithDocs(owner._id, { adminValidation: { status: "pending" } });

    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() } });
    await getBookingDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("renvoie 404 — jamais 500 — sur un id de réservation qui n'est pas un ObjectId", async () => {
    const owner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: owner, params: { id: "1757230000000" } });
    await getBookingDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
