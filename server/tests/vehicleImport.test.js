import { describe, it, expect } from "vitest";
import { createImportBatch, getImportBatch, listImportBatches } from "../controllers/vehicleImportController.js";
import { MAX_IMPORT_ROWS } from "../services/vehicleImportService.js";
import VehicleImportBatch from "../models/VehicleImportBatch.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const csvBase64 = (rows) => Buffer.from(rows.join("\n"), "utf-8").toString("base64");

describe("createImportBatch — portes d'accès", () => {
  it("réservé aux partenaires/admin", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, body: { source: "csv" } });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("targetType=export réservé aux Founding Partners", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: false });
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", targetType: "export", fileBase64: csvBase64(["titre", "x"]), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FOUNDING_PARTNER_REQUIRED");
  });

  it("rejette une méthode d'import invalide", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { source: "ftp" } });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejette l'absence de fichier pour source csv/excel", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { source: "csv" } });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejette l'absence de lien pour source google_sheet", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { source: "google_sheet" } });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejette un fichier vide (aucune ligne)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", fileBase64: csvBase64(["titre"]), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it(`rejette un fichier dépassant MAX_IMPORT_ROWS (${MAX_IMPORT_ROWS})`, async () => {
    const partner = await createUser({ role: "partenaire" });
    const rows = ["titre", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Ligne ${i}`)];
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", fileBase64: csvBase64(rows), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(new RegExp(`maximum ${MAX_IMPORT_ROWS}`));
  });

  it("crée un batch pour un fichier valide sous la limite", async () => {
    const partner = await createUser({ role: "partenaire" });
    // La colonne "type" (TypeAnnonce) doit être présente et reconnue, sinon le
    // batch est désormais rejeté à l'upload (voir isTypeColumnRecognized) plutôt
    // que créé pour échouer ligne par ligne au traitement.
    const rows = ["titre,TypeAnnonce", "Ligne 1,location", "Ligne 2,vente"];
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", fileBase64: csvBase64(rows), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(202);
    expect(res.body.totalRows).toBe(2);

    const batch = await VehicleImportBatch.findById(res.body.batchId);
    expect(batch).not.toBeNull();
    expect(batch.owner.toString()).toBe(partner._id.toString());
    expect(batch.targetType).toBe("vehicle");
  }, 20000);
});

describe("getImportBatch", () => {
  it("403 pour un utilisateur qui n'est pas le propriétaire du batch", async () => {
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const batch = await VehicleImportBatch.create({ owner: owner._id, targetType: "vehicle", source: "csv", totalRows: 1, status: "processing" });

    const { req, res } = mockReqRes({ user: stranger, params: { batchId: batch._id.toString() } });
    await getImportBatch(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("accessible par le propriétaire et par un admin", async () => {
    const owner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const batch = await VehicleImportBatch.create({ owner: owner._id, targetType: "vehicle", source: "csv", totalRows: 1, status: "processing" });

    const own = mockReqRes({ user: owner, params: { batchId: batch._id.toString() } });
    await getImportBatch(own.req, own.res);
    expect(own.res.statusCode).toBe(200);

    const adminRes = mockReqRes({ user: admin, params: { batchId: batch._id.toString() } });
    await getImportBatch(adminRes.req, adminRes.res);
    expect(adminRes.res.statusCode).toBe(200);
  });

  it("404 pour un batch inexistant", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, params: { batchId: "000000000000000000000000" } });
    await getImportBatch(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("listImportBatches", () => {
  it("ne renvoie que les batches du partenaire connecté, sans pendingRows", async () => {
    const owner1 = await createUser({ role: "partenaire" });
    const owner2 = await createUser({ role: "partenaire" });
    await VehicleImportBatch.create({ owner: owner1._id, targetType: "vehicle", source: "csv", totalRows: 1, status: "completed", pendingRows: [{ titre: "x" }] });
    await VehicleImportBatch.create({ owner: owner2._id, targetType: "vehicle", source: "csv", totalRows: 1, status: "completed" });

    const { req, res } = mockReqRes({ user: owner1 });
    await listImportBatches(req, res);
    expect(res.body.batches).toHaveLength(1);
    expect(res.body.batches[0].pendingRows).toBeUndefined();
  });
});
