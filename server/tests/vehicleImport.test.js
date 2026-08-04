import { describe, it, expect } from "vitest";
import { createImportBatch, getImportBatch, listImportBatches } from "../controllers/vehicleImportController.js";
import { MAX_IMPORT_ROWS } from "../services/vehicleImportService.js";
import VehicleImportBatch from "../models/VehicleImportBatch.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import PartnerVerification from "../models/PartnerVerification.js";
import Vehicle from "../models/Vehicle.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const csvBase64 = (rows) => Buffer.from(rows.join("\n"), "utf-8").toString("base64");
const validFleetRows = () => ["titre,TypeAnnonce", "Ligne 1,location", "Ligne 2,vente"];

// Le fallback synchrone de la queue PARTNER_FEED est DÉFÉRÉ (setImmediate,
// voir DEFERRED_SYNC_QUEUES dans queue/index.js) — createImportBatch répond
// avant la fin réelle du traitement du batch. Un test qui a besoin du résultat
// complet (results/incompleteCount…) doit donc attendre explicitement la fin,
// comme le fait le frontend en pollant /api/vehicles/import/:batchId.
async function waitForBatchCompletion(batchId, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const batch = await VehicleImportBatch.findById(batchId);
    if (batch && batch.status !== "processing") return batch;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Timeout en attente de la fin du batch (test).");
}

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
    const partner = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: partner, body: { source: "ftp" } });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejette l'absence de fichier pour source csv/excel", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: partner, body: { source: "csv" } });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejette l'absence de lien pour source google_sheet", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: partner, body: { source: "google_sheet" } });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejette un fichier vide (aucune ligne)", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", fileBase64: csvBase64(["titre"]), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it(`rejette un fichier dépassant MAX_IMPORT_ROWS (${MAX_IMPORT_ROWS})`, async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true });
    const rows = ["titre", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Ligne ${i}`)];
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", fileBase64: csvBase64(rows), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(new RegExp(`maximum ${MAX_IMPORT_ROWS}`));
  });

  it("crée un batch pour un fichier valide sous la limite", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true });
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

  // ── Mêmes portes que createVehicle (vehicle.create.test.js) — l'import en
  // masse contournait jusqu'ici totalement KYC/certification/suspension, un
  // partenaire non vérifié pouvait publier des centaines de véhicules d'un
  // coup via un simple upload de fichier. Bug réel trouvé en audit.
  it("bloque un particulier non-fondateur sans KYC vérifié (KYC_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "particulier", kycStatus: "EN_ATTENTE" });
    const { req, res } = mockReqRes({
      user: seller, body: { source: "csv", fileBase64: csvBase64(validFleetRows()), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("KYC_REQUIRED");
  });

  it("bloque un professionnel/entreprise sans badge de certification (CERTIFICATION_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "professionnel", certificationBadge: "none" });
    const { req, res } = mockReqRes({
      user: seller, body: { source: "csv", fileBase64: csvBase64(validFleetRows()), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("CERTIFICATION_REQUIRED");
  });

  it("bloque un partenaire suspendu (PARTNER_SUSPENDED), même Founding Partner", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    await PartnerVerification.create({ userId: founder._id, companyName: "Alpha Motors", status: "suspendu" });
    const { req, res } = mockReqRes({
      user: founder, body: { source: "csv", fileBase64: csvBase64(validFleetRows()), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PARTNER_SUSPENDED");
  });

  it("résout le pays depuis l'entreprise choisie (businessId) et l'enregistre sur le batch", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true, country: "CI" });
    const business = await PartnerBusiness.create({
      owner: founder._id, companyName: "Alpha Motors", country: "SN", ville: "Dakar",
    });
    const { req, res } = mockReqRes({
      user: founder,
      body: { source: "csv", fileBase64: csvBase64(validFleetRows()), fileName: "f.csv", businessId: business._id.toString() },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(202);

    const batch = await VehicleImportBatch.findById(res.body.batchId);
    expect(batch.business.toString()).toBe(business._id.toString());
  }, 20000);

  it("refuse un businessId qui n'appartient pas au partenaire", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const stranger = await createUser({ role: "partenaire", isFounder: true });
    const business = await PartnerBusiness.create({
      owner: stranger._id, companyName: "Alpha Motors", country: "SN", ville: "Dakar",
    });
    const { req, res } = mockReqRes({
      user: founder,
      body: { source: "csv", fileBase64: csvBase64(validFleetRows()), fileName: "f.csv", businessId: business._id.toString() },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(400);
  });
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

// ── Résumé agrégé "créé mais incomplet" (bug réel : un import de ~300 lignes
// sans prix/carburant/transmission/ville/adresse se terminait "296 créé(s)"
// sans qu'aucun signal ne remonte que ces annonces restaient incomplètes —
// voir findMissingKeyFields dans vehicleImportService.js). ──────────────────
describe("createImportBatch — résumé des champs essentiels manquants", () => {
  it("signale les véhicules créés mais incomplets (prix/carburant/transmission/ville/adresse absents du fichier)", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true });
    // Fichier réaliste : aucune colonne Carburant/Transmission/PrixParJour/
    // Ville/Adresse/PhotosURLs — reproduit exactement le scénario production
    // (colonnes absentes du fichier soumis par le partenaire, pas juste vides).
    const rows = [
      "Titre,Marque,Modele,Annee,TypeAnnonce,NomContact,TelephoneContact",
      "Toyota Corolla 2020,Toyota,Corolla,2020,location,Jean Kouassi,0700000000",
    ];
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", fileBase64: csvBase64(rows), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(202);

    const batch = await waitForBatchCompletion(res.body.batchId);
    expect(batch.status).toBe("completed");
    expect(batch.results).toHaveLength(1);
    expect(batch.results[0].status).toBe("created");
    expect(batch.results[0].missingKeyFields.sort()).toEqual(
      ["adresse", "carburant", "price", "transmission", "ville"].sort()
    );

    // Le véhicule est bien créé (pas bloqué) — mais reste "pending", jamais
    // "approved" automatiquement, tant qu'un admin ne l'a pas validé.
    const vehicle = await Vehicle.findById(batch.results[0].vehicleId);
    expect(vehicle).not.toBeNull();
    expect(vehicle.status).toBe("pending");

    // Résumé agrégé au niveau du batch entier — c'est ce chiffre qui manquait
    // en production, pas seulement le détail ligne par ligne.
    expect(batch.incompleteCount).toBe(1);
    expect(batch.missingFieldsBreakdown).toMatchObject({
      price: 1, carburant: 1, transmission: 1, ville: 1, adresse: 1,
    });
  }, 20000);

  it("ne signale rien quand le véhicule créé a bien tous les champs essentiels", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true });
    const rows = [
      "Titre,Marque,Modele,Annee,TypeAnnonce,Carburant,Transmission,PrixParJour,Ville,Adresse,NomContact,TelephoneContact",
      "Toyota Corolla 2020,Toyota,Corolla,2020,location,Essence,Automatique,25000,Abidjan,Cocody,Jean Kouassi,0700000000",
    ];
    const { req, res } = mockReqRes({
      user: partner, body: { source: "csv", fileBase64: csvBase64(rows), fileName: "f.csv" },
    });
    await createImportBatch(req, res);
    expect(res.statusCode).toBe(202);

    const batch = await waitForBatchCompletion(res.body.batchId);
    expect(batch.results[0].missingKeyFields).toEqual([]);
    expect(batch.incompleteCount).toBe(0);
    expect(batch.missingFieldsBreakdown).toBeNull();
  }, 20000);
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
