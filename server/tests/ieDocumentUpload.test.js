import { describe, it, expect } from "vitest";
import { updateDocuments } from "../controllers/ieTransactionController.js";
import IETransaction from "../models/IETransaction.js";
import { createUser, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Le champ `url` existait sur le schéma de document (docStatusSchema) mais
// n'était jamais rempli par aucune UI — seul un statut ("fourni") pouvait
// être déclaré, jamais le fichier lui-même. Manque réel trouvé en audit.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("ieTransactionController.updateDocuments — upload réel de fichier", () => {
  it("accepte un document valide (data URI image) et l'enregistre", async () => {
    const partner = await createUser({ isFounder: true });
    const tx = await createIETransaction({ partner: partner._id, status: "in_escrow" });

    const { req, res } = mockReqRes({
      user: partner, params: { id: tx._id.toString() },
      body: { documents: { commercialInvoice: { url: TINY_PNG, status: "fourni" } } },
    });
    await updateDocuments(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await IETransaction.findById(tx._id);
    expect(saved.documents.commercialInvoice.url).toBe(TINY_PNG);
    expect(saved.documents.commercialInvoice.status).toBe("fourni");
  });

  it("refuse un format de document invalide", async () => {
    const partner = await createUser({ isFounder: true });
    const tx = await createIETransaction({ partner: partner._id, status: "in_escrow" });

    const { req, res } = mockReqRes({
      user: partner, params: { id: tx._id.toString() },
      body: { documents: { commercialInvoice: { url: "data:text/plain;base64,aGVsbG8=", status: "fourni" } } },
    });
    await updateDocuments(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse un document trop volumineux", async () => {
    const partner = await createUser({ isFounder: true });
    const tx = await createIETransaction({ partner: partner._id, status: "in_escrow" });

    const bigBase64 = "A".repeat(12 * 1024 * 1024); // ~9 Mo décodé, au-delà de la limite de 8 Mo
    const { req, res } = mockReqRes({
      user: partner, params: { id: tx._id.toString() },
      body: { documents: { commercialInvoice: { url: `data:image/png;base64,${bigBase64}`, status: "fourni" } } },
    });
    await updateDocuments(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("n'écrase pas le fichier existant si url est omis", async () => {
    const partner = await createUser({ isFounder: true });
    const tx = await createIETransaction({ partner: partner._id, status: "in_escrow" });
    tx.documents.commercialInvoice = { url: TINY_PNG, status: "fourni" };
    await tx.save();

    const { req, res } = mockReqRes({
      user: partner, params: { id: tx._id.toString() },
      body: { documents: { commercialInvoice: { status: "fourni" } } },
    });
    await updateDocuments(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await IETransaction.findById(tx._id);
    expect(saved.documents.commercialInvoice.url).toBe(TINY_PNG);
  });
});
