import { describe, it, expect } from "vitest";
import {
  createTicket, getMyTickets, getTicket, replyToTicket, adminListTickets, adminUpdateTicket,
} from "../controllers/supportController.js";
import SupportTicket from "../models/SupportTicket.js";
import Subscription from "../models/Subscription.js";
import Notification from "../models/Notification.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const abonner = (user, plan) => Subscription.create({
  vendor: user._id, plan,
  planDetails: { startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000), isActive: true, priceUSD: 19.99 },
});

const ouvrir = async (user, body = {}) => {
  const { req, res } = mockReqRes({ user, body: { subject: "Problème de publication", content: "Mon annonce reste en attente.", ...body } });
  await createTicket(req, res);
  return res;
};

describe("Assistance — priorité et délai selon le palier", () => {
  it("un compte gratuit est servi, mais en bas de file et avec un délai long", async () => {
    // L'assistance ne se ferme pas aux comptes gratuits : ce que l'abonnement
    // achète est la priorité, pas le droit d'écrire au support.
    const u = await createUser({ role: "partenaire" });
    const res = await ouvrir(u);
    expect(res.statusCode).toBe(201);
    expect(res.body.ticket.priority).toBe("low");
    expect(res.body.delaiReponseHeures).toBe(72);
    expect(res.body.prioritaire).toBe(false);
  });

  it("un abonné Exportateur passe en urgent avec un délai de 4 h", async () => {
    const u = await createUser({ role: "partenaire" });
    await abonner(u, "exportateur");
    const res = await ouvrir(u);
    expect(res.body.ticket.priority).toBe("urgent");
    expect(res.body.delaiReponseHeures).toBe(4);
    expect(res.body.prioritaire).toBe(true);
    // L'échéance est calculée, pas seulement annoncée : c'est elle qui ordonne
    // la file admin.
    const ecart = new Date(res.body.ticket.slaDueAt).getTime() - Date.now();
    expect(ecart).toBeGreaterThan(3.5 * 3600 * 1000);
    expect(ecart).toBeLessThan(4.5 * 3600 * 1000);
  });

  it("l'ouverture d'un ticket notifie RÉELLEMENT les administrateurs", async () => {
    // Le type « support_ticket » doit figurer dans l'enum de Notification :
    // absent, la validation Mongoose lève, notifyAdmins avale l'erreur, et la
    // demande n'atteint jamais le support. Ce dépôt a déjà connu ce scénario
    // deux fois (assignation transitaire, webhook e-mail).
    const admin = await createUser({ role: "admin" });
    await createUser({ role: "admin", isActive: false }); // ne doit rien recevoir
    const u = await createUser({ role: "partenaire" });
    await ouvrir(u, { subject: "Annonce bloquée" });

    const notifs = await Notification.find({ type: "support_ticket" }).lean();
    expect(notifs).toHaveLength(1);
    expect(String(notifs[0].user)).toBe(String(admin._id));
    expect(notifs[0].lien).toBe("/admin?tab=assistance");
    // Le nom du demandeur doit apparaître : `req.user.name` n'existe pas sur
    // User (firstName/lastName), et l'écrire ainsi affichait « undefined ».
    expect(notifs[0].message).not.toMatch(/undefined/);
  });

  it("une demande de facturation ou de KYC monte d'un cran, même sans abonnement", async () => {
    // Un compte gratuit bloqué sur son KYC ne peut RIEN faire sur la
    // plateforme : le laisser en bas de file pendant trois jours revient à le
    // perdre.
    const u = await createUser({ role: "partenaire" });
    const res = await ouvrir(u, { category: "kyc" });
    expect(res.body.ticket.priority).toBe("medium"); // low → medium
  });

  it("le palier est FIGÉ à l'ouverture : une expiration ne rétrograde pas un dossier en cours", async () => {
    const u = await createUser({ role: "partenaire" });
    const sub = await abonner(u, "business");
    const res = await ouvrir(u);
    expect(res.body.ticket.plan).toBe("business");

    await Subscription.updateOne({ _id: sub._id }, { $set: { "planDetails.isActive": false } });
    const t = await SupportTicket.findById(res.body.ticket._id).lean();
    expect(t.plan).toBe("business");
    expect(t.priority).toBe("high");
  });

  it("l'auteur ne peut pas se hisser lui-même en urgent", async () => {
    // Laisser choisir sa priorité vide la notion en une semaine : tout le monde
    // coche « urgent ».
    const u = await createUser({ role: "partenaire" });
    const res = await ouvrir(u, { priority: "urgent" });
    expect(res.body.ticket.priority).toBe("low");
  });

  it("refuse un ticket sans objet ou sans message", async () => {
    const u = await createUser({ role: "partenaire" });
    expect((await ouvrir(u, { subject: "   " })).statusCode).toBe(400);
    expect((await ouvrir(u, { content: "" })).statusCode).toBe(400);
    expect((await ouvrir(u, { category: "inexistante" })).statusCode).toBe(400);
  });

  it("plafonne les tickets ouverts simultanément par un même compte", async () => {
    const u = await createUser({ role: "partenaire" });
    for (let i = 0; i < 10; i++) expect((await ouvrir(u)).statusCode).toBe(201);
    const trop = await ouvrir(u);
    expect(trop.statusCode).toBe(429);
    // Un ticket clos ne compte plus : le plafond limite l'encours, pas l'usage.
    await SupportTicket.updateMany({ userId: u._id }, { $set: { status: "closed" } });
    expect((await ouvrir(u)).statusCode).toBe(201);
  });
});

describe("Assistance — cloisonnement entre comptes", () => {
  it("le ticket d'un autre compte est inaccessible en lecture comme en réponse", async () => {
    const a = await createUser({ role: "partenaire" });
    const b = await createUser({ role: "partenaire" });
    const { body } = await ouvrir(a);
    const id = body.ticket._id;

    const lecture = mockReqRes({ user: b, params: { id: String(id) } });
    await getTicket(lecture.req, lecture.res);
    expect(lecture.res.statusCode).toBe(403);

    const reponse = mockReqRes({ user: b, params: { id: String(id) }, body: { content: "Je m'incruste" } });
    await replyToTicket(reponse.req, reponse.res);
    expect(reponse.res.statusCode).toBe(403);

    const liste = mockReqRes({ user: b });
    await getMyTickets(liste.req, liste.res);
    expect(liste.res.body.tickets).toHaveLength(0);
  });

  it("la vue renvoyée à l'auteur n'expose jamais l'agent assigné", async () => {
    const u = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const { body } = await ouvrir(u);
    await SupportTicket.updateOne({ _id: body.ticket._id }, { $set: { assignedTo: admin._id } });

    const { req, res } = mockReqRes({ user: u, params: { id: String(body.ticket._id) } });
    await getTicket(req, res);
    expect(res.body.ticket.assignedTo).toBeUndefined();
    expect(res.body.ticket.userId).toBeUndefined();
  });
});

describe("Assistance — échanges et file admin", () => {
  it("une réponse admin horodate le premier retour et notifie l'auteur", async () => {
    const u = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const { body } = await ouvrir(u);

    const { req, res } = mockReqRes({ user: admin, params: { id: String(body.ticket._id) }, body: { content: "Nous regardons." } });
    await replyToTicket(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ticket.premierRetourFait).toBe(true);
    expect(res.body.ticket.status).toBe("waiting_user");
    expect(res.body.ticket.messages.at(-1).auteur).toBe("Support VIT AUTO");

    // La notification est le point où ce projet a déjà échoué deux fois : un
    // type absent de l'enum lève, le catch avale l'erreur, et personne n'est
    // prévenu. On vérifie donc qu'elle est bien EN BASE.
    const notif = await Notification.findOne({ user: u._id, type: "support_reply" }).lean();
    expect(notif).toBeTruthy();
    expect(notif.titre).toMatch(/Réponse du support/);
  });

  it("un ticket clos n'accepte plus de message", async () => {
    const u = await createUser({ role: "partenaire" });
    const { body } = await ouvrir(u);
    await SupportTicket.updateOne({ _id: body.ticket._id }, { $set: { status: "closed" } });
    const { req, res } = mockReqRes({ user: u, params: { id: String(body.ticket._id) }, body: { content: "Encore un mot" } });
    await replyToTicket(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("la file admin place l'échéance la plus proche en tête, sans affamer les comptes gratuits", async () => {
    const gratuit = await createUser({ role: "partenaire" });
    const expo    = await createUser({ role: "partenaire" });
    await abonner(expo, "exportateur");

    await ouvrir(gratuit);
    await ouvrir(expo);
    // Le ticket gratuit est vieux de deux jours : son échéance (72 h) tombe
    // désormais avant celle de l'exportateur (4 h à partir de maintenant).
    await SupportTicket.updateOne({ userId: gratuit._id }, { $set: { slaDueAt: new Date(Date.now() + 3600 * 1000) } });

    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, query: {} });
    await adminListTickets(req, res);
    expect(res.body.tickets).toHaveLength(2);
    expect(String(res.body.tickets[0].userId._id)).toBe(String(gratuit._id));
  });

  it("signale les tickets dont le délai promis est dépassé", async () => {
    const u = await createUser({ role: "partenaire" });
    await ouvrir(u);
    await SupportTicket.updateMany({ userId: u._id }, { $set: { slaDueAt: new Date(Date.now() - 3600 * 1000) } });

    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, query: {} });
    await adminListTickets(req, res);
    expect(res.body.enRetard).toBe(1);
    expect(res.body.tickets[0].enRetard).toBe(true);
  });

  it("une clôture admin notifie l'auteur et horodate la résolution", async () => {
    const u = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const { body } = await ouvrir(u);

    const { req, res } = mockReqRes({ user: admin, params: { id: String(body.ticket._id) }, body: { status: "resolved" } });
    await adminUpdateTicket(req, res);
    expect(res.body.ticket.status).toBe("resolved");
    expect((await SupportTicket.findById(body.ticket._id).lean()).resolvedAt).toBeTruthy();
    expect(await Notification.findOne({ user: u._id, titre: /résolue/ }).lean()).toBeTruthy();
  });

  it("refuse un statut ou une priorité hors énumération", async () => {
    const u = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const { body } = await ouvrir(u);
    const a = mockReqRes({ user: admin, params: { id: String(body.ticket._id) }, body: { status: "en_vacances" } });
    await adminUpdateTicket(a.req, a.res);
    expect(a.res.statusCode).toBe(400);
    const b = mockReqRes({ user: admin, params: { id: String(body.ticket._id) }, body: { priority: "critique" } });
    await adminUpdateTicket(b.req, b.res);
    expect(b.res.statusCode).toBe(400);
  });
});
