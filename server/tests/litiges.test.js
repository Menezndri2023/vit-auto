import { describe, it, expect, beforeEach, vi } from "vitest";

// Le dépôt de pièces passe par ImageKit : bouchonné (aucun envoi réel).
vi.mock("../config/imagekit.js", async (orig) => ({
  ...(await orig()),
  uploadDocument: vi.fn(async () => ({ url: "https://ik.example/vit-auto/docs/litiges/piece.pdf" })),
}));

const { default: IETransaction } = await import("../models/IETransaction.js");
const { default: Litige } = await import("../models/Litige.js");
const { default: Notification } = await import("../models/Notification.js");
const { openDispute } = await import("../controllers/ieTransactionController.js");
const { ouvrir, transition, message, piece, listerLitigesTransaction } = await import("../controllers/litigeController.js");
const { liberationDemandable } = await import("../services/litigeService.js");
const { proposerConditions, accepterConditions } = await import("../services/conditionsLiberationService.js");
const { createUser, createIETransaction } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

// ═══════════════════════════════════════════════════════════════════════════
// LITIGES (conception validée le 2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// Un litige ne modifie jamais le statut commercial, le règlement direct, le
// paiement ni la logistique ; il interdit seulement à VIT AUTO de DEMANDER une
// libération ; aucun texte ne parle de fonds bloqués.

const appel = async (fn, opts) => { const m = mockReqRes(opts); await fn(m.req, m.res); return m.res; };
const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF").toString("base64");

// Ce qu'un litige ne doit JAMAIS toucher.
const empreinte = (t) => JSON.stringify({ status: t.status, reglementDirect: t.reglementDirect, payment: t.payment, shipping: t.shipping, documents: t.documents, dispute: t.dispute });

describe("Litiges", () => {
  let client, partner, admin, tx;
  beforeEach(async () => {
    // Index uniques construits en arrière-plan : on les attend (voir report.test.js).
    await Litige.init();
    client = await createUser({ role: "client" });
    partner = await createUser({ role: "partenaire", isFounder: true });
    admin = await createUser({ role: "admin" });
    tx = await createIETransaction({ client: client._id, partner: partner._id, status: "preparing",
      finalOffer: { totalAmount: 25000, currency: "EUR", vehiclePrice: 25000 },
      reglementDirect: { etat: "payment_confirmed", declareParAcheteurLe: new Date(), confirmeParExportateurLe: new Date() } });
  });
  const ouvrirPar = (user, body = { motif: "non_conforme", description: "Le véhicule ne correspond pas à l'annonce." }) =>
    appel(ouvrir, { user, params: { id: String(tx._id) }, body });

  it("ouvrir un litige ne modifie ni le statut, ni le règlement direct, ni le paiement, ni la logistique", async () => {
    const avant = empreinte((await IETransaction.findById(tx._id)).toObject());
    const r = await ouvrirPar(client);
    expect(r.statusCode).toBe(201);
    expect(r.body.litige.reference).toMatch(/^VA-LIT-\d{4}-\d{6}$/);
    const apres = await IETransaction.findById(tx._id);
    expect(empreinte(apres.toObject())).toBe(avant);
    expect(String(apres.litigeEnCours)).toBe(String(r.body.litige._id));
    expect(r.body.litige.contexte).toMatchObject({ statutCommercial: "preparing", reglementDirect: "payment_confirmed", fondsLiberes: true });
  });

  it("l'ancienne route /dispute ouvre un Litige au lieu de passer la transaction en « disputed »", async () => {
    const r = await appel(openDispute, { user: partner, params: { id: String(tx._id) }, body: { reason: "Acheteur injoignable depuis la livraison." } });
    expect(r.statusCode).toBe(200);
    expect(r.body.transaction.status).toBe("preparing");
    expect(await Litige.countDocuments({ "transaction.id": tx._id, partieOuvrante: "vendeur", motif: "autre" })).toBe(1);
  });

  it("un seul litige ouvert à la fois ; tiers refusé ; motif et statut contrôlés", async () => {
    expect((await ouvrirPar(client)).statusCode).toBe(201);
    expect((await ouvrirPar(partner)).statusCode).toBe(409);
    expect((await ouvrirPar(await createUser())).statusCode).toBe(403);
    const autre = await createIETransaction({ client: client._id, partner: partner._id, status: "reserved" });
    expect((await appel(ouvrir, { user: client, params: { id: String(autre._id) }, body: { motif: "autre", description: "Trop tôt pour réclamer." } })).statusCode).toBe(409);
    const autre2 = await createIETransaction({ client: client._id, partner: partner._id, status: "delivered" });
    expect((await appel(ouvrir, { user: client, params: { id: String(autre2._id) }, body: { motif: "inconnu", description: "Motif hors liste." } })).statusCode).toBe(400);
  });

  it("aucun texte ne parle de fonds bloqués ; VIT AUTO dit ne pas détenir les fonds", async () => {
    await ouvrirPar(client);
    const notifs = await Notification.find({ type: "ie_dispute" }).lean();
    expect(notifs.length).toBeGreaterThan(0);
    for (const n of notifs) expect(`${n.titre} ${n.message}`).not.toMatch(/bloqu|séquestr|gel[ée]|suspendu/i);
    const pourVendeur = notifs.find((n) => String(n.user) === String(partner._id));
    expect(pourVendeur.message).toMatch(/ne détient pas les fonds/);
  });

  it("un litige ouvert empêche VIT AUTO de demander la libération, jusqu'à sa clôture", async () => {
    expect((await liberationDemandable(tx._id)).ok).toBe(true);
    const id = String((await ouvrirPar(client)).body.litige._id);
    expect((await liberationDemandable(tx._id)).ok).toBe(false);

    const t = (vers, body = {}) => appel(transition, { user: admin, params: { litigeId: id }, body: { vers, ...body } });
    expect((await t("closed")).statusCode).toBe(409);                                  // transition interdite
    expect((await appel(transition, { user: client, params: { litigeId: id }, body: { vers: "under_review" } })).statusCode).toBe(403);
    expect((await t("under_review")).statusCode).toBe(200);
    expect((await t("resolved", { decision: "Remise de 500 EUR" })).statusCode).toBe(400); // justification exigée
    expect((await t("resolved", { decision: "Remise de 500 EUR", justification: "Rayure confirmée par photos." })).statusCode).toBe(200);
    expect((await liberationDemandable(tx._id)).ok).toBe(false);                         // résolu ≠ clos
    expect((await t("closed")).statusCode).toBe(200);
    expect((await liberationDemandable(tx._id)).ok).toBe(true);
    const apres = await IETransaction.findById(tx._id);
    expect(apres.litigeEnCours).toBeNull();
    expect(apres.status).toBe("preparing");
    // Un nouveau litige peut ensuite être ouvert.
    expect((await ouvrirPar(partner)).statusCode).toBe(201);
  });

  it("messages et pièces : parties et admin ; pièce privée lue par URL ; rien après clôture", async () => {
    const id = String((await ouvrirPar(client)).body.litige._id);
    expect((await appel(message, { user: partner, params: { litigeId: id }, body: { texte: "Photos de départ jointes." } })).statusCode).toBe(200);
    expect((await appel(message, { user: await createUser(), params: { litigeId: id }, body: { texte: "intrus" } })).statusCode).toBe(403);
    expect((await appel(piece, { user: client, params: { litigeId: id }, body: { nom: "PV", fichier: "data:text/plain;base64,aGVsbG8=" } })).statusCode).toBe(400);
    expect((await appel(piece, { user: client, params: { litigeId: id }, body: { nom: "PV de réception", fichier: PDF } })).statusCode).toBe(201);
    const liste = await appel(listerLitigesTransaction, { user: client, params: { id: String(tx._id) } });
    expect(liste.body.litiges[0].pieces[0]).toMatchObject({ nom: "PV de réception", partie: "acheteur" });
    expect(liste.body.litiges[0].messages[0].partie).toBe("vendeur");

    for (const vers of ["under_review"]) await appel(transition, { user: admin, params: { litigeId: id }, body: { vers } });
    await appel(transition, { user: admin, params: { litigeId: id }, body: { vers: "rejected", decision: "Rejetée", justification: "Aucun défaut constaté." } });
    await appel(transition, { user: admin, params: { litigeId: id }, body: { vers: "closed" } });
    expect((await appel(message, { user: client, params: { litigeId: id }, body: { texte: "encore" } })).statusCode).toBe(409);
  });

  it("échéance de réponse : seulement si les deux parties ont accepté un délai", async () => {
    const sans = await Litige.findById((await ouvrirPar(client)).body.litige._id);
    expect(sans.echeanceReponse).toBeNull();

    const tx2 = await createIETransaction({ client: client._id, partner: partner._id, status: "delivered", finalOffer: { totalAmount: 1000, currency: "EUR" } });
    const v1 = await proposerConditions(tx2, partner, { delaiReponseLitigeJours: 7 });
    await accepterConditions(tx2, partner, { version: 1, hash: v1.hash });
    await accepterConditions(tx2, client, { version: 1, hash: v1.hash });
    const r = await appel(ouvrir, { user: client, params: { id: String(tx2._id) }, body: { motif: "endommage", description: "Pare-choc arrière enfoncé." } });
    const jours = (new Date(r.body.litige.echeanceReponse) - new Date(r.body.litige.ouvertLe)) / 86400000;
    expect(Math.round(jours)).toBe(7);
    expect(r.body.litige.conditions.version).toBe(1);
  });
});
