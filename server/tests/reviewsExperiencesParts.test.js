import { describe, it, expect } from "vitest";
import { createReview, getReviews, getShowcaseReviews } from "../controllers/reviewController.js";
import Booking from "../models/Booking.js";
import Activity from "../models/Activity.js";
import SparePart from "../models/SparePart.js";
import User from "../models/User.js";
import { createUser, createActivityDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// AVIS — pôles Experiences et Parts (exploitant, 2026-10-27)
// ═══════════════════════════════════════════════════════════════════════════
// Même système que véhicule/chauffeur : seul le client d'une réservation
// TERMINÉE note la ressource, une seule fois ; il peut aussi noter le
// prestataire, et le prestataire le noter en retour.

const clientInfo = (u) => ({ firstName: u.firstName, lastName: u.lastName, email: u.email, passportNumber: "P1234567" });

async function reservationActivite(statut = "completed") {
  const owner = await createUser({ role: "partenaire" });
  const client = await createUser({ role: "client" });
  const activity = await createActivityDoc({ owner: owner._id });
  const booking = await Booking.create({ type: "activite", clientInfo: clientInfo(client), client: client._id, activity: activity._id, status: statut });
  return { owner, client, activity, booking };
}

async function commandePiece(statut = "completed") {
  const owner = await createUser({ role: "partenaire" });
  const client = await createUser({ role: "client" });
  const part = await SparePart.create({
    owner: owner._id, category: "FREINAGE", title: "Plaquettes avant", price: 40, stock: 5,
    compatibility: [{ marque: "Peugeot" }], status: "approved",
  });
  const booking = await Booking.create({ type: "piece", clientInfo: clientInfo(client), client: client._id, part: part._id, status: statut });
  return { owner, client, part, booking };
}

const avis = async (user, body) => {
  const m = mockReqRes({ user, body });
  await createReview(m.req, m.res);
  return m.res;
};

describe("Avis Experiences", () => {
  it("le client note l'activité réalisée ; la note moyenne de l'activité est mise à jour", async () => {
    const { client, activity, booking } = await reservationActivite();
    const r = await avis(client, { bookingId: booking._id.toString(), note: 4, commentaire: "Super sortie, guide attentif" });
    expect(r.statusCode).toBe(201);
    expect(r.body.review.targetType).toBe("activity");
    expect(String(r.body.review.targetId)).toBe(String(activity._id));

    const a = await Activity.findById(activity._id).lean();
    expect(a.noteMoyenne).toBe(4);
    expect(a.nombreAvis).toBe(1);
    expect((await Booking.findById(booking._id).lean()).review).toBeTruthy();
  });

  it("pas d'avis avant la fin de la réservation", async () => {
    const { client, booking } = await reservationActivite("confirmed");
    const r = await avis(client, { bookingId: booking._id.toString(), targetType: "activity", note: 5, commentaire: "Avant même d'y aller" });
    expect(r.statusCode).toBe(400);
  });

  it("pas de second avis sur la même réservation", async () => {
    const { client, booking } = await reservationActivite();
    await avis(client, { bookingId: booking._id.toString(), targetType: "activity", note: 5, commentaire: "Top" });
    const r = await avis(client, { bookingId: booking._id.toString(), targetType: "activity", note: 1, commentaire: "Encore" });
    expect(r.statusCode).toBe(409);
  });

  it("un tiers ne note pas une réservation qui n'est pas la sienne", async () => {
    const { booking } = await reservationActivite();
    const intrus = await createUser({ role: "client" });
    const r = await avis(intrus, { bookingId: booking._id.toString(), targetType: "activity", note: 1, commentaire: "Faux avis" });
    expect(r.statusCode).toBe(403);
  });

  it("le client note le prestataire de loisirs, et le prestataire note le client", async () => {
    const { owner, client, booking } = await reservationActivite();
    const p = await avis(client, { bookingId: booking._id.toString(), targetType: "partner", note: 5 });
    expect(p.statusCode).toBe(201);
    expect(String(p.body.review.targetId)).toBe(String(owner._id));
    const c = await avis(owner, { bookingId: booking._id.toString(), targetType: "client", note: 4 });
    expect(c.statusCode).toBe(201);
    expect((await User.findById(client._id).lean()).clientReliability.nombreAvis).toBe(1);
  });

  it("le client ne peut pas se faire passer pour le prestataire", async () => {
    const { client, booking } = await reservationActivite();
    expect((await avis(client, { bookingId: booking._id.toString(), targetType: "client", note: 5 })).statusCode).toBe(403);
  });
});

describe("Avis Parts", () => {
  it("le client note la pièce reçue ; la note de la pièce est mise à jour", async () => {
    const { client, part, booking } = await commandePiece();
    const r = await avis(client, { bookingId: booking._id.toString(), targetType: "part", note: 3, commentaire: "Conforme, livraison lente" });
    expect(r.statusCode).toBe(201);
    expect(r.body.review.targetType).toBe("part");
    const p = await SparePart.findById(part._id).lean();
    expect(p.noteMoyenne).toBe(3);
    expect(p.nombreAvis).toBe(1);
  });

  it("une commande non reçue (en cours de livraison) ne peut pas être notée", async () => {
    const { client, booking } = await commandePiece("in_progress");
    expect((await avis(client, { bookingId: booking._id.toString(), targetType: "part", note: 5, commentaire: "?" })).statusCode).toBe(400);
  });

  it("le vendeur de pièces note son client", async () => {
    const { owner, booking } = await commandePiece();
    expect((await avis(owner, { bookingId: booking._id.toString(), targetType: "client", note: 5 })).statusCode).toBe(201);
  });

  it("les avis sur une pièce et une activité sont publics et peuvent figurer en vitrine", async () => {
    const { client, part, booking } = await commandePiece();
    await avis(client, { bookingId: booking._id.toString(), targetType: "part", note: 5, commentaire: "Parfait, bien emballé" });

    const m = mockReqRes({ query: { targetType: "part", targetId: String(part._id) } });
    await getReviews(m.req, m.res);
    expect(m.res.body.total).toBe(1);
    expect(m.res.body.noteMoyenne).toBe(5);

    const s = mockReqRes({ query: {} });
    await getShowcaseReviews(s.req, s.res);
    expect(s.res.body.reviews.map((x) => x.commentaire)).toContain("Parfait, bien emballé");
  });
});
