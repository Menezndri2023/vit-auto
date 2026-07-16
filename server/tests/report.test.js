import { describe, it, expect } from "vitest";
import { createReport, getReports, updateReportStatus } from "../controllers/reportController.js";
import Report from "../models/Report.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import mongoose from "mongoose";

describe("createReport", () => {
  it("rejette un targetType inconnu ou des champs manquants", async () => {
    const reporter = await createUser();
    const { req, res } = mockReqRes({
      user: reporter, body: { targetType: "not_a_type", targetId: new mongoose.Types.ObjectId(), reason: "fraude" },
    });
    await createReport(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("crée un signalement valide", async () => {
    const reporter = await createUser();
    const targetId = new mongoose.Types.ObjectId();
    const { req, res } = mockReqRes({
      user: reporter,
      body: { targetType: "vehicle", targetId, reason: "annonce_fausse", description: "Prix incohérent" },
    });
    await createReport(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.report.status).toBe("en_attente");
    expect(res.body.report.reporter.toString()).toBe(reporter._id.toString());
  });

  it("un même utilisateur ne peut pas signaler deux fois la même cible (contrainte unique)", async () => {
    // Les index (dont la contrainte unique reporter+targetType+targetId) sont
    // construits en arrière-plan par Mongoose ; sans attendre Report.init(), le
    // second create() ci-dessous peut s'exécuter avant que l'index existe
    // réellement côté serveur Mongo et passer à tort (faux négatif de ce test,
    // pas un vrai bug de la contrainte elle-même — en production le serveur
    // tourne largement assez longtemps pour que l'index soit prêt).
    await Report.init();

    const reporter = await createUser();
    const targetId = new mongoose.Types.ObjectId();
    const body = { targetType: "vehicle", targetId, reason: "fraude" };

    const first = mockReqRes({ user: reporter, body });
    await createReport(first.req, first.res);
    expect(first.res.statusCode).toBe(201);

    const second = mockReqRes({ user: reporter, body });
    await createReport(second.req, second.res);
    // Pas une erreur pour l'appelant — message informatif, jamais de 500/409.
    expect(second.res.statusCode).toBe(200);
    expect(second.res.body.message).toMatch(/déjà signalé/i);

    const count = await Report.countDocuments({ reporter: reporter._id, targetType: "vehicle", targetId });
    expect(count).toBe(1);
  });

  it("deux utilisateurs différents peuvent signaler la même cible", async () => {
    const targetId = new mongoose.Types.ObjectId();
    const body = { targetType: "vehicle", targetId, reason: "fraude" };

    const reporter1 = await createUser();
    const r1 = mockReqRes({ user: reporter1, body });
    await createReport(r1.req, r1.res);
    expect(r1.res.statusCode).toBe(201);

    const reporter2 = await createUser();
    const r2 = mockReqRes({ user: reporter2, body });
    await createReport(r2.req, r2.res);
    expect(r2.res.statusCode).toBe(201);

    const count = await Report.countDocuments({ targetType: "vehicle", targetId });
    expect(count).toBe(2);
  });
});

describe("getReports (admin)", () => {
  it("filtre par statut et pagine", async () => {
    const reporter = await createUser();
    await Report.create([
      { reporter: reporter._id, targetType: "vehicle", targetId: new mongoose.Types.ObjectId(), reason: "fraude", status: "en_attente" },
      { reporter: reporter._id, targetType: "driver",  targetId: new mongoose.Types.ObjectId(), reason: "autre",  status: "action_prise" },
    ]);

    const { req, res } = mockReqRes({ query: { status: "en_attente" } });
    await getReports(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.reports[0].status).toBe("en_attente");
  });
});

describe("updateReportStatus (admin)", () => {
  it("rejette un statut invalide", async () => {
    const reporter = await createUser();
    const report = await Report.create({ reporter: reporter._id, targetType: "vehicle", targetId: new mongoose.Types.ObjectId(), reason: "autre" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: report._id.toString() }, body: { status: "not_a_status" } });
    await updateReportStatus(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("traite un signalement et enregistre reviewedBy/reviewedAt", async () => {
    const reporter = await createUser();
    const report = await Report.create({ reporter: reporter._id, targetType: "vehicle", targetId: new mongoose.Types.ObjectId(), reason: "autre" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: report._id.toString() }, body: { status: "action_prise", reviewNote: "Annonce retirée" },
    });
    await updateReportStatus(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.report.status).toBe("action_prise");
    expect(res.body.report.reviewedBy.toString()).toBe(admin._id.toString());
    expect(res.body.report.reviewNote).toBe("Annonce retirée");
  });

  it("404 pour un signalement introuvable", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: new mongoose.Types.ObjectId().toString() }, body: { status: "examine" } });
    await updateReportStatus(req, res);
    expect(res.statusCode).toBe(404);
  });
});
