import { describe, it, expect } from "vitest";
import {
  createLead, getLead, updateLead, deleteLead,
  createQuote, updateQuote, sendQuote,
} from "../controllers/pmsController.js";
import Lead from "../models/Lead.js";
import Quote from "../models/Quote.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("pmsController — isolation par partenaire (leads)", () => {
  it("createLead ignore tout partnerId envoyé dans le body — toujours celui de req.user", async () => {
    const partner = await createUser({ role: "partenaire" });
    const someoneElse = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({
      user: partner,
      body: { partnerId: someoneElse._id.toString(), buyer: { name: "Client Test" }, source: "website" },
    });
    await createLead(req, res);

    expect(res.body.partnerId.toString()).toBe(partner._id.toString());
  });

  it("un partenaire ne peut ni lire, ni modifier, ni supprimer le lead d'un autre partenaire (404)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const intruder = await createUser({ role: "partenaire" });
    const lead = await Lead.create({ partnerId: owner._id, buyer: { name: "Client Test" } });

    const get = mockReqRes({ user: intruder, params: { id: lead._id.toString() } });
    await getLead(get.req, get.res);
    expect(get.res.status).toHaveBeenCalledWith(404);

    const update = mockReqRes({ user: intruder, params: { id: lead._id.toString() }, body: { status: "gagne" } });
    await updateLead(update.req, update.res);
    expect(update.res.status).toHaveBeenCalledWith(404);

    const del = mockReqRes({ user: intruder, params: { id: lead._id.toString() } });
    await deleteLead(del.req, del.res);
    expect(del.res.status).toHaveBeenCalledWith(404);

    // Toujours là — l'intrus n'a rien pu modifier ni supprimer
    expect(await Lead.findById(lead._id)).not.toBeNull();
  });
});

describe("pmsController — devis (quotes)", () => {
  it("calcule les totaux côté serveur à partir des lignes (jamais un total envoyé par le client)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({
      user: partner,
      body: {
        buyer: { name: "Client Test" },
        lines: [
          { description: "Véhicule", qty: 1, unitPrice: 20000 },
          { description: "Transport", qty: 2, unitPrice: 500 },
        ],
        discount: 10, // 10%
        taxRate: 5,   // 5%
        total: 1,     // valeur truquée envoyée par le client — doit être ignorée
      },
    });
    await createQuote(req, res);

    // subtotal = 20000 + 2*500 = 21000 ; discount 10% = 2100 ; afterDiscount = 18900 ; tax 5% = 945 ; total = 19845
    expect(res.body.subtotal).toBe(21000);
    expect(res.body.discountAmount).toBe(2100);
    expect(res.body.taxAmount).toBe(945);
    expect(res.body.total).toBe(19845);
  });

  it("recalcule les totaux à chaque updateQuote, pas seulement à la création", async () => {
    const partner = await createUser({ role: "partenaire" });
    const quote = await Quote.create({
      partnerId: partner._id, buyer: { name: "Client Test" },
      lines: [{ description: "Véhicule", qty: 1, unitPrice: 10000 }],
    });

    const { req, res } = mockReqRes({
      user: partner, params: { id: quote._id.toString() },
      body: { lines: [{ description: "Véhicule", qty: 1, unitPrice: 30000 }], discount: 0, taxRate: 0 },
    });
    await updateQuote(req, res);
    expect(res.body.total).toBe(30000);
  });

  it("conserve le champ incoterm sur un devis (whitelist QUOTE_UPDATE_FIELDS)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { buyer: { name: "Client Test" }, incoterm: "FOB" } });
    await createQuote(req, res);
    expect(res.body.incoterm).toBe("FOB");
  });

  it("sendQuote refuse un devis déjà accepté et un devis d'un autre partenaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const intruder = await createUser({ role: "partenaire" });
    const accepted = await Quote.create({ partnerId: owner._id, buyer: { name: "Client Test" }, status: "accepte" });

    const wrongStatus = mockReqRes({ user: owner, params: { id: accepted._id.toString() } });
    await sendQuote(wrongStatus.req, wrongStatus.res);
    expect(wrongStatus.res.status).toHaveBeenCalledWith(404);

    const draft = await Quote.create({ partnerId: owner._id, buyer: { name: "Client Test" }, status: "brouillon" });
    const wrongOwner = mockReqRes({ user: intruder, params: { id: draft._id.toString() } });
    await sendQuote(wrongOwner.req, wrongOwner.res);
    expect(wrongOwner.res.status).toHaveBeenCalledWith(404);
  });

  it("sendQuote marque le devis envoyé et horodate l'envoi", async () => {
    const partner = await createUser({ role: "partenaire" });
    const quote = await Quote.create({ partnerId: partner._id, buyer: { name: "Client Test", email: "buyer@example.test" }, status: "brouillon" });

    const { req, res } = mockReqRes({ user: partner, params: { id: quote._id.toString() } });
    await sendQuote(req, res);

    expect(res.body.status).toBe("envoye");
    expect(res.body.sentAt).toBeTruthy();
  });
});
