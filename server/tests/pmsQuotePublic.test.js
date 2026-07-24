import { describe, it, expect } from "vitest";
import { createQuote, sendQuote, getPublicQuote, respondPublicQuote } from "../controllers/pmsController.js";
import Quote from "../models/Quote.js";
import Lead from "../models/Lead.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Le lien envoyé par email/SMS à l'acheteur ne menait nulle part jusqu'ici
// (aucune route publique de consultation/réponse) — manque réel trouvé en audit.
const minimalQuoteBody = (overrides = {}) => ({
  buyer: { name: "Awa Koné", email: "awa@example.test" },
  lines: [{ description: "Toyota Land Cruiser", qty: 1, unitPrice: 25000, category: "vehicule" }],
  currency: "USD",
  ...overrides,
});

describe("PMS — boucle acheteur devis (consultation + réponse publique)", () => {
  it("génère un publicToken unique à la création", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: minimalQuoteBody() });
    await createQuote(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.publicToken).toBeTruthy();
  });

  it("refuse un leadId qui n'appartient pas au partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const lead = await Lead.create({ partnerId: stranger._id });

    const { req, res } = mockReqRes({ user: partner, body: minimalQuoteBody({ leadId: lead._id.toString() }) });
    await createQuote(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rattache le devis au lead et synchronise son statut à l'envoi", async () => {
    const partner = await createUser({ role: "partenaire" });
    const lead = await Lead.create({ partnerId: partner._id, status: "en_discussion" });

    const create = mockReqRes({ user: partner, body: minimalQuoteBody({ leadId: lead._id.toString() }) });
    await createQuote(create.req, create.res);
    expect(create.res.body.leadId.toString()).toBe(lead._id.toString());

    const send = mockReqRes({ user: partner, params: { id: create.res.body._id.toString() } });
    await sendQuote(send.req, send.res);
    expect(send.res.statusCode).toBe(200);

    const savedLead = await Lead.findById(lead._id);
    expect(savedLead.status).toBe("devis_envoye");
    expect(savedLead.quoteId.toString()).toBe(create.res.body._id.toString());
  });

  it("synchronise aussi le lead pour un devis créé directement avec status=envoye (Créer & Envoyer)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const lead = await Lead.create({ partnerId: partner._id, status: "en_discussion" });

    const { req, res } = mockReqRes({ user: partner, body: minimalQuoteBody({ leadId: lead._id.toString(), status: "envoye" }) });
    await createQuote(req, res);
    expect(res.statusCode).toBe(201);

    const savedLead = await Lead.findById(lead._id);
    expect(savedLead.status).toBe("devis_envoye");
  });

  it("getPublicQuote : introuvable pour un token invalide", async () => {
    const { req, res } = mockReqRes({ params: { token: "invalid-token" } });
    await getPublicQuote(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("getPublicQuote : passe le statut à 'vu' au premier accès", async () => {
    const quote = await Quote.create({
      partnerId: (await createUser({ role: "partenaire" }))._id,
      status: "envoye",
      lines: [{ description: "x", qty: 1, unitPrice: 100 }],
    });

    const { req, res } = mockReqRes({ params: { token: quote.publicToken } });
    await getPublicQuote(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("vu");
    expect(res.body.viewedAt).toBeTruthy();
  });

  it("respondPublicQuote : accepte le devis et fait progresser le lead", async () => {
    const partner = await createUser({ role: "partenaire" });
    const lead = await Lead.create({ partnerId: partner._id, status: "devis_envoye" });
    const quote = await Quote.create({
      partnerId: partner._id, leadId: lead._id, status: "envoye",
      lines: [{ description: "x", qty: 1, unitPrice: 100 }],
    });

    const { req, res } = mockReqRes({ params: { token: quote.publicToken }, body: { action: "accept" } });
    await respondPublicQuote(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("accepte");

    const savedLead = await Lead.findById(lead._id);
    expect(savedLead.status).toBe("negociation");
  });

  it("respondPublicQuote : refuse le devis et marque le lead perdu", async () => {
    const partner = await createUser({ role: "partenaire" });
    const lead = await Lead.create({ partnerId: partner._id, status: "devis_envoye" });
    const quote = await Quote.create({
      partnerId: partner._id, leadId: lead._id, status: "envoye",
      lines: [{ description: "x", qty: 1, unitPrice: 100 }],
    });

    const { req, res } = mockReqRes({ params: { token: quote.publicToken }, body: { action: "refuse" } });
    await respondPublicQuote(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("refuse");

    const savedLead = await Lead.findById(lead._id);
    expect(savedLead.status).toBe("perdu");
  });

  it("respondPublicQuote : refuse une seconde réponse au même devis", async () => {
    const partner = await createUser({ role: "partenaire" });
    const quote = await Quote.create({
      partnerId: partner._id, status: "accepte", answeredAt: new Date(),
      lines: [{ description: "x", qty: 1, unitPrice: 100 }],
    });

    const { req, res } = mockReqRes({ params: { token: quote.publicToken }, body: { action: "refuse" } });
    await respondPublicQuote(req, res);
    expect(res.statusCode).toBe(409);
  });
});
