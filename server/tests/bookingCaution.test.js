import { describe, it, expect } from "vitest";
import { claimCaution, enregistrerEtatDesLieux } from "../controllers/bookingController.js";
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
    // Gate admin obligatoire (audit 2026-08) : ces tests portent sur la
    // caution d'une location déjà arrivée à "completed", donc forcément déjà
    // validée par un admin bien avant (voir assertPartnerCanAct) — pas l'objet
    // de ce fichier de test.
    adminValidation: { status: "approved" },
    client: client._id,
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" , passportNumber: "P1234567"},
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

// ── État des lieux photo (2026-09-26) ──────────────────────────────────────
//
// `claimCaution` ci-dessus permet de retenir sur la caution, mais SANS aucune
// preuve : le client n'a rien à opposer, le partenaire rien à produire, et
// l'administration arbitre parole contre parole. La caution est le premier
// motif de friction du secteur location.
describe("bookingController.enregistrerEtatDesLieux", () => {
  const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const releve = (user, booking, body) => mockReqRes({
    user, params: { id: booking._id.toString() },
    body: { photos: [PHOTO], ...body },
  });

  it("enregistre le départ avec ses photos, son kilométrage et son carburant", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = releve(owner, booking, { moment: "depart", kilometrage: 45000, carburant: 80, notes: "Rayure aile avant droite" });
    await enregistrerEtatDesLieux(req, res);
    expect(res.statusCode).toBe(200);

    const apres = await Booking.findById(booking._id).lean();
    expect(apres.etatDesLieux.depart.photos).toHaveLength(1);
    expect(apres.etatDesLieux.depart.kilometrage).toBe(45000);
    expect(apres.etatDesLieux.depart.carburant).toBe(80);
    expect(apres.etatDesLieux.depart.faitLe).toBeTruthy();
    expect(apres.etatDesLieux.depart.parQui.toString()).toBe(owner._id.toString());
  });

  it("refuse un retour tant que le départ n'a pas été relevé", async () => {
    // Comparer un état à un état jamais relevé ne prouve rien.
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = releve(owner, booking, { moment: "retour", kilometrage: 46000 });
    await enregistrerEtatDesLieux(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/départ/i);
  });

  it("ne réécrit jamais un relevé déjà fait", async () => {
    // Le refaire effacerait précisément ce qu'il sert à prouver.
    const { owner, booking } = await makeCompletedLocationBooking();
    const un = releve(owner, booking, { moment: "depart", kilometrage: 45000 });
    await enregistrerEtatDesLieux(un.req, un.res);
    expect(un.res.statusCode).toBe(200);

    const deux = releve(owner, booking, { moment: "depart", kilometrage: 99999 });
    await enregistrerEtatDesLieux(deux.req, deux.res);
    expect(deux.res.statusCode).toBe(409);
    expect((await Booking.findById(booking._id).lean()).etatDesLieux.depart.kilometrage).toBe(45000);
  });

  it("exige au moins une photo — c'est tout l'objet d'un état des lieux", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() },
      body: { moment: "depart", photos: [], kilometrage: 45000 },
    });
    await enregistrerEtatDesLieux(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse un partenaire qui n'est pas propriétaire, et un moment inconnu", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const inconnu = await createUser({ role: "partenaire" });
    const etranger = releve(inconnu, booking, { moment: "depart" });
    await enregistrerEtatDesLieux(etranger.req, etranger.res);
    expect(etranger.res.statusCode).toBe(403);

    const mauvais = releve(owner, booking, { moment: "milieu" });
    await enregistrerEtatDesLieux(mauvais.req, mauvais.res);
    expect(mauvais.res.statusCode).toBe(400);
  });

  it("le carburant est un pourcentage : 120 % est refusé", async () => {
    const { owner, booking } = await makeCompletedLocationBooking();
    const { req, res } = releve(owner, booking, { moment: "depart", carburant: 120 });
    await enregistrerEtatDesLieux(req, res);
    expect(res.statusCode).toBe(400);
  });
});
