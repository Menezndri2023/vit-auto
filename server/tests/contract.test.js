import { describe, it, expect } from "vitest";
import { createContract, getContract, signContract, getPartnerContracts } from "../controllers/contractController.js";
import Contract from "../models/Contract.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// PNG transparent 1x1 valide (magic bytes réels) — validateImageDataUri vérifie
// le contenu binaire, pas seulement le préfixe déclaré.
const VALID_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function createLocationBooking({ client, vehicle, overrides = {} }) {
  return Booking.create({
    type: "location",
    clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email },
    client: client._id,
    vehicle: vehicle._id,
    status: "confirmed",
    montantTotal: 100000,
    ...overrides,
  });
}

describe("createContract", () => {
  it("403 si l'appelant n'est ni le propriétaire du véhicule ni admin", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const intruder = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });

    const { req, res } = mockReqRes({ user: intruder, body: { bookingId: booking._id.toString() } });
    await createContract(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("le propriétaire du véhicule peut créer le contrat, avec les bons montants", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 20000 });
    const booking = await createLocationBooking({
      client, vehicle, overrides: { montantTotal: 150000, commissionRate: 0.15, commissionAmount: 22500 },
    });

    const { req, res } = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.contract.terms.totalXOF).toBe(150000);
    expect(res.body.contract.terms.commissionXOF).toBe(22500);
    expect(res.body.contract.status).toBe("sent");

    const reloadedBooking = await Booking.findById(booking._id);
    expect(reloadedBooking.contract.toString()).toBe(res.body.contract._id.toString());
  });

  it("un admin peut créer le contrat même sans posséder le véhicule", async () => {
    const admin = await createUser({ role: "admin" });
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });

    const { req, res } = mockReqRes({ user: admin, body: { bookingId: booking._id.toString() } });
    await createContract(req, res);
    expect(res.statusCode).toBe(201);
  });

  it("un second appel renvoie le contrat existant plutôt que d'en créer un doublon", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });

    const first = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(first.req, first.res);

    const second = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(second.req, second.res);
    expect(second.res.body.contract._id.toString()).toBe(first.res.body.contract._id.toString());

    const count = await Contract.countDocuments({ booking: booking._id });
    expect(count).toBe(1);
  });
});

describe("getContract — contrôle d'accès", () => {
  it("le client de la réservation peut consulter le contrat", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });
    const created = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(created.req, created.res);

    const { req, res } = mockReqRes({ user: client, params: { id: created.res.body.contract._id.toString() } });
    await getContract(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("un tiers sans lien avec la réservation ne peut pas consulter le contrat", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser();
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });
    const created = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(created.req, created.res);

    const { req, res } = mockReqRes({ user: stranger, params: { id: created.res.body.contract._id.toString() } });
    await getContract(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("accessible aussi via le bookingId, pas seulement le contractId", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });
    const created = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(created.req, created.res);

    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() } });
    await getContract(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.contract._id.toString()).toBe(created.res.body.contract._id.toString());
  });
});

describe("signContract", () => {
  it("rejette une signature qui n'est pas une image valide", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });
    const created = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(created.req, created.res);

    const { req, res } = mockReqRes({
      user: client, params: { id: created.res.body.contract._id.toString() },
      body: { signature: "data:image/png;base64,not-real-png-bytes" },
    });
    await signContract(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse la signature d'un utilisateur qui n'est pas le client de la réservation", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser();
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });
    const created = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(created.req, created.res);

    const { req, res } = mockReqRes({
      user: stranger, params: { id: created.res.body.contract._id.toString() }, body: { signature: VALID_SIGNATURE },
    });
    await signContract(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("signe le contrat pour le bon client et refuse une seconde signature", async () => {
    const client = await createUser();
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await createLocationBooking({ client, vehicle });
    const created = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(created.req, created.res);

    const { req, res } = mockReqRes({
      user: client, params: { id: created.res.body.contract._id.toString() }, body: { signature: VALID_SIGNATURE },
    });
    await signContract(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.contract.isSigned).toBe(true);
    expect(res.body.contract.status).toBe("signed");

    const { req: req2, res: res2 } = mockReqRes({
      user: client, params: { id: created.res.body.contract._id.toString() }, body: { signature: VALID_SIGNATURE },
    });
    await signContract(req2, res2);
    expect(res2.statusCode).toBe(409);
  });

  it("autorise la signature par email correspondant, même sans compte connecté sur la réservation", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    // Réservation invitée : pas de client._id, seulement clientInfo.email.
    const booking = await Booking.create({
      type: "location",
      clientInfo: { firstName: "Invité", lastName: "Test", email: "invite@example.test" },
      vehicle: vehicle._id,
      status: "confirmed",
      montantTotal: 100000,
    });
    const created = mockReqRes({ user: owner, body: { bookingId: booking._id.toString() } });
    await createContract(created.req, created.res);

    const anonUser = await createUser({ email: "different@example.test" });
    const { req, res } = mockReqRes({
      user: anonUser, params: { id: created.res.body.contract._id.toString() },
      body: { signature: VALID_SIGNATURE, clientEmail: "invite@example.test" },
    });
    await signContract(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("getPartnerContracts", () => {
  it("ne renvoie que les contrats liés aux véhicules/chauffeurs du partenaire connecté", async () => {
    const client = await createUser();
    const owner1 = await createUser({ role: "partenaire" });
    const owner2 = await createUser({ role: "partenaire" });
    const vehicle1 = await createVehicleDoc({ owner: owner1._id });
    const vehicle2 = await createVehicleDoc({ owner: owner2._id });
    const booking1 = await createLocationBooking({ client, vehicle: vehicle1 });
    const booking2 = await createLocationBooking({ client, vehicle: vehicle2 });
    await Contract.create({ booking: booking1._id, type: "location", status: "sent" });
    await Contract.create({ booking: booking2._id, type: "location", status: "sent" });

    const { req, res } = mockReqRes({ user: owner1 });
    await getPartnerContracts(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.contracts).toHaveLength(1);
    expect(res.body.contracts[0].booking._id.toString()).toBe(booking1._id.toString());
  });
});
