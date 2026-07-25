import { describe, it, expect } from "vitest";
import {
  adminList, adminGetOne, adminSendAgreement, adminUpdateCRM,
  verifySigningToken, signByToken, downloadLOIPDF, downloadAgreementPDF,
} from "../controllers/partnerOnboardingController.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import User from "../models/User.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("adminList", () => {
  it("filtre par statut et par recherche sur la raison sociale", async () => {
    const p1 = await createUser({ role: "partenaire" });
    const p2 = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({ userId: p1._id, status: "soumis", companyInfo: { legalName: "Alpha Motors" } });
    await PartnerOnboarding.create({ userId: p2._id, status: "actif", companyInfo: { legalName: "Beta Cars" } });

    const { req, res } = mockReqRes({ query: { status: "soumis" } });
    await adminList(req, res);
    expect(res.body.total).toBe(1);
    expect(res.body.onboardings[0].companyInfo.legalName).toBe("Alpha Motors");

    const { req: req2, res: res2 } = mockReqRes({ query: { search: "alpha" } });
    await adminList(req2, res2);
    expect(res2.body.total).toBe(1);
  });

  it("ignore un statut hors énumération plutôt que de planter", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const { req, res } = mockReqRes({ query: { status: "not_a_status" } });
    await adminList(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1); // filtre ignoré, pas de crash
  });
});

describe("adminGetOne", () => {
  it("404 pour un dossier inexistant", async () => {
    const { req, res } = mockReqRes({ params: { id: "000000000000000000000000" } });
    await adminGetOne(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("renvoie le dossier avec l'utilisateur peuplé", async () => {
    const partner = await createUser({ role: "partenaire" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const { req, res } = mockReqRes({ params: { id: doc._id.toString() } });
    await adminGetOne(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.onboarding.userId._id.toString()).toBe(partner._id.toString());
  });
});

describe("adminUpdateCRM", () => {
  it("400 si aucun champ CRM valide n'est fourni", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: { crmStatus: "not_valid" } });
    await adminUpdateCRM(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("met à jour les champs CRM valides", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: doc._id.toString() },
      body: { crmStatus: "verified", priority: "high", internalNotes: "Contact prévu" },
    });
    await adminUpdateCRM(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.adminCRM.crmStatus).toBe("verified");
    expect(res.body.adminCRM.priority).toBe("high");
  });
});

describe("adminSendAgreement", () => {
  it("400 si la LOI n'a pas encore été signée", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() } });
    await adminSendAgreement(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("génère l'accord et passe le dossier à accord_envoye", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const doc = await PartnerOnboarding.create({
      userId: partner._id, status: "loi_signee", companyInfo: { legalName: "Test SARL" },
    });
    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() } });
    await adminSendAgreement(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("accord_envoye");
    expect(res.body.signLink).toBeTruthy();

    const reloaded = await PartnerOnboarding.findById(doc._id);
    expect(reloaded.agreement.content).toBeTruthy();
    expect(reloaded.agreement.signingToken).toBeTruthy();
    expect(reloaded.status).toBe("accord_envoye");
  });
});

describe("verifySigningToken", () => {
  it("400 pour un token trop court", async () => {
    const { req, res } = mockReqRes({ params: { token: "short" } });
    await verifySigningToken(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("404 pour un token inconnu ou expiré", async () => {
    const { req, res } = mockReqRes({ params: { token: "a".repeat(64) } });
    await verifySigningToken(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("valide un token LOI en cours et signale déjà signé le cas échéant", async () => {
    const partner = await createUser({ role: "partenaire" });
    const doc = await PartnerOnboarding.create({
      userId: partner._id, status: "loi_envoyee", companyInfo: { legalName: "Test SARL" },
      loi: { content: "Contenu LOI", signingToken: "b".repeat(64), signingTokenExpires: new Date(Date.now() + 3600_000) },
    });
    const { req, res } = mockReqRes({ params: { token: "b".repeat(64) } });
    await verifySigningToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.type).toBe("loi");
    expect(res.body.alreadySigned).toBe(false);
  });

  it("un token expiré n'est plus valide", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: partner._id, status: "loi_envoyee",
      loi: { content: "Contenu LOI", signingToken: "c".repeat(64), signingTokenExpires: new Date(Date.now() - 1000) },
    });
    const { req, res } = mockReqRes({ params: { token: "c".repeat(64) } });
    await verifySigningToken(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("signByToken", () => {
  it("signe la LOI puis enchaîne automatiquement sur l'Accord (même lien)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const token = "d".repeat(64);
    const doc = await PartnerOnboarding.create({
      userId: partner._id, status: "loi_envoyee", companyInfo: { legalName: "Test SARL" },
      loi: { content: "Contenu LOI", signingToken: token, signingTokenExpires: new Date(Date.now() + 3600_000) },
    });

    const { req, res } = mockReqRes({ params: { token }, body: { signerName: "Jean Dupont" } });
    await signByToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe("loi");
    // status reflète l'état APRÈS l'enchaînement automatique sur l'Accord
    // (autoGenerateAgreement s'exécute avant la réponse) — pas l'état
    // intermédiaire "loi_signee".
    expect(res.body.status).toBe("accord_envoye");
    expect(res.body.chained).toBe(true);

    const reloaded = await PartnerOnboarding.findById(doc._id);
    expect(reloaded.loi.signedAt).toBeTruthy();
    expect(reloaded.loi.signingToken).toBeNull(); // token consommé
    expect(reloaded.agreement.content).toBeTruthy(); // accord généré automatiquement
    expect(reloaded.status).toBe("accord_envoye");
  });

  it("signe l'Accord, active isFounder et le badge Founding Partner", async () => {
    const partner = await createUser({ role: "partenaire" });
    const token = "e".repeat(64);
    await PartnerOnboarding.create({
      userId: partner._id, status: "accord_envoye", companyInfo: { legalName: "Test SARL" },
      agreement: { content: "Contenu Accord", signingToken: token, signingTokenExpires: new Date(Date.now() + 3600_000) },
      commissions: { location: 8, vente: 5, chauffeur: 10 },
    });

    const { req, res } = mockReqRes({ params: { token }, body: { signerName: "Jean Dupont" } });
    await signByToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe("agreement");
    expect(res.body.status).toBe("accord_signe");

    const reloadedUser = await User.findById(partner._id);
    expect(reloadedUser.isFounder).toBe(true);
  });

  it("400 si le nom du signataire est manquant", async () => {
    const { req, res } = mockReqRes({ params: { token: "f".repeat(64) }, body: {} });
    await signByToken(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("404 pour un token déjà consommé (signedAt déjà rempli)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const token = "0".repeat(64);
    await PartnerOnboarding.create({
      userId: partner._id, status: "loi_signee",
      loi: { content: "x", signedAt: new Date(), signingToken: null, signingTokenExpires: null },
    });
    const { req, res } = mockReqRes({ params: { token }, body: { signerName: "Jean Dupont" } });
    await signByToken(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("downloadLOIPDF / downloadAgreementPDF", () => {
  it("404 si le document n'est pas encore disponible", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({ userId: partner._id, businessId: business._id, status: "soumis" });
    const { req, res } = mockReqRes({ user: { id: partner._id } });
    await downloadLOIPDF(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("génère un PDF quand le contenu de la LOI existe", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({
      userId: partner._id, businessId: business._id, status: "loi_envoyee", referenceNumber: "VA-FP-TEST-001",
      loi: { content: "Contenu LOI de test" },
    });
    const res = { setHeader: () => {}, send: (buf) => { res.sentBuffer = buf; res.statusCode = res.statusCode || 200; } };
    const req = { user: { id: partner._id } };
    await downloadLOIPDF(req, res);
    expect(Buffer.isBuffer(res.sentBuffer)).toBe(true);
    expect(res.sentBuffer.length).toBeGreaterThan(0);
  });

  it("404 si l'accord n'est pas encore disponible", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({ userId: partner._id, businessId: business._id, status: "loi_signee" });
    const { req, res } = mockReqRes({ user: { id: partner._id } });
    await downloadAgreementPDF(req, res);
    expect(res.statusCode).toBe(404);
  });
});
