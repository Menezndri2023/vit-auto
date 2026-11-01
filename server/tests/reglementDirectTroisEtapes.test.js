import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Dépôt de la preuve : ImageKit bouchonné (aucun envoi réel).
vi.mock("../config/imagekit.js", async (orig) => ({
  ...(await orig()),
  uploadDocument: vi.fn(async () => ({ url: "https://ik.example/vit-auto/docs/reglements/preuve.pdf" })),
}));

const { etatSequestre, declarerReglementDirect, acceptOffer } = await import("../controllers/ieTransactionController.js");
const { default: IETransaction } = await import("../models/IETransaction.js");
const { default: ConditionsLiberation } = await import("../models/ConditionsLiberation.js");
const { default: AcceptationConditions } = await import("../models/AcceptationConditions.js");
const { proposerConditions, accepterConditions } = await import("../services/conditionsLiberationService.js");
const { createUser, createIETransaction } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

// ═══════════════════════════════════════════════════════════════════════════
// RÈGLEMENT DIRECT EN TROIS ÉTAPES (règle de l'exploitant, 2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// terms_accepted (les deux parties, version en vigueur) → payment_declared
// (acheteur, preuve facultative) → payment_confirmed (vendeur). Une
// modification des conditions exige une nouvelle acceptation des deux parties.

const appel = async (fn, opts) => { const m = mockReqRes(opts); await fn(m.req, m.res); return m.res; };
const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF").toString("base64");

describe("Règlement direct en trois étapes", () => {
  let client, partner, tx;
  beforeEach(async () => {
    etatSequestre.actif = false;
    await Promise.all([ConditionsLiberation.init(), AcceptationConditions.init()]);
    client = await createUser({ role: "client" });
    partner = await createUser({ role: "partenaire", isFounder: true });
    tx = await createIETransaction({ client: client._id, partner: partner._id, status: "offer_sent",
      finalOffer: { totalAmount: 25000, currency: "EUR", vehiclePrice: 25000 } });
  });
  afterEach(() => { etatSequestre.actif = true; });
  const id = () => String(tx._id);
  const accepterLesDeux = async (c) => {
    await accepterConditions(tx, client, { version: c.version, hash: c.hash });
    await accepterConditions(tx, partner, { version: c.version, hash: c.hash });
  };

  it("l'acceptation de l'offre crée la version 1 (origine plateforme) à accepter par les deux parties", async () => {
    expect((await appel(acceptOffer, { user: client, params: { id: id() } })).statusCode).toBe(200);
    const v1 = await ConditionsLiberation.findOne({ "transaction.id": tx._id }).lean();
    expect(v1).toMatchObject({ version: 1, origine: "plateforme", proposePar: null });
    expect(v1.contenu).toMatchObject({ montant: 25000, devise: "EUR" });
    expect((await IETransaction.findById(tx._id).lean()).reglementDirect.etat).toBe("none");
  });

  it("chaque acceptation est horodatée avec la version exacte ; terms_accepted quand les deux ont accepté", async () => {
    await appel(acceptOffer, { user: client, params: { id: id() } });
    tx = await IETransaction.findById(tx._id);
    const v1 = await ConditionsLiberation.findOne({ "transaction.id": tx._id });
    await accepterConditions(tx, client, { version: 1, hash: v1.hash });
    expect((await IETransaction.findById(tx._id).lean()).reglementDirect.etat).toBe("none");
    await accepterConditions(tx, partner, { version: 1, hash: v1.hash });
    expect((await IETransaction.findById(tx._id).lean()).reglementDirect.etat).toBe("terms_accepted");
    const traces = await AcceptationConditions.find({ "transaction.id": tx._id }).lean();
    expect(traces).toHaveLength(2);
    for (const t of traces) expect(t).toMatchObject({ version: 1, hash: v1.hash, le: expect.any(Date) });
  });

  it("une modification des conditions exige une nouvelle acceptation des deux parties avant de déclarer", async () => {
    await appel(acceptOffer, { user: client, params: { id: id() } });
    tx = await IETransaction.findById(tx._id);
    await accepterLesDeux(await ConditionsLiberation.findOne({ "transaction.id": tx._id }));
    const v2 = await proposerConditions(tx, partner, { conformite: "Contrôle technique export exigé." });
    expect((await IETransaction.findById(tx._id).lean()).reglementDirect.etat).toBe("none");
    const refus = await appel(declarerReglementDirect, { user: client, params: { id: id() }, body: {} });
    expect(refus.statusCode).toBe(409);
    expect(refus.body.code).toBe("CONDITIONS_NON_ACCEPTEES");
    await accepterLesDeux(v2);
    const ok = await appel(declarerReglementDirect, { user: client, params: { id: id() }, body: {} });
    expect(ok.statusCode).toBe(200);
    expect((await IETransaction.findById(tx._id).lean()).reglementDirect.conditionsDeclaration.version).toBe(2);
  });

  it("l'acheteur peut joindre une preuve (privée) ; la déclaration ne vaut jamais réception", async () => {
    await appel(acceptOffer, { user: client, params: { id: id() } });
    tx = await IETransaction.findById(tx._id);
    await accepterLesDeux(await ConditionsLiberation.findOne({ "transaction.id": tx._id }));
    expect((await appel(declarerReglementDirect, { user: client, params: { id: id() }, body: { preuve: { nom: "avis.txt", fichier: "data:text/plain;base64,aGVsbG8=" } } })).statusCode).toBe(400);
    const r = await appel(declarerReglementDirect, { user: client, params: { id: id() }, body: { reference: "SWIFT-77", preuve: { nom: "Avis de virement.pdf", fichier: PDF } } });
    expect(r.statusCode).toBe(200);
    const apres = await IETransaction.findById(tx._id).lean();
    expect(apres.reglementDirect.preuveAcheteur).toMatchObject({ nom: "Avis de virement.pdf", url: expect.stringContaining("/docs/reglements/") });
    expect(apres.reglementDirect.etat).toBe("payment_declared");
    expect(apres.reglementDirect.confirmeParExportateurLe).toBeNull();
    expect(apres.status).toBe("payment_pending");
    // Une nouvelle version APRÈS la déclaration ne la fait pas revenir en arrière.
    await proposerConditions(tx, client, { conformite: "Ajout après déclaration." });
    expect((await IETransaction.findById(tx._id).lean()).reglementDirect.etat).toBe("payment_declared");
    // Le vendeur confirme ensuite la réception (sa déclaration).
    const c = await appel(declarerReglementDirect, { user: partner, params: { id: id() }, body: { note: "Reçu sur le compte." } });
    expect(c.statusCode).toBe(200);
    expect((await IETransaction.findById(tx._id).lean())).toMatchObject({ status: "preparing", reglementDirect: { etat: "payment_confirmed" } });
  });
});
