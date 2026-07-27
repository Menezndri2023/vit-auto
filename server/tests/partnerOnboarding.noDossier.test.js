import { describe, it, expect } from "vitest";
import { adminList, adminRelaunchBusiness } from "../controllers/partnerOnboardingController.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Bug réel : un partenaire ayant créé une entité (PartnerBusiness) mais
// n'ayant jamais cliqué "Commencer ma candidature" (applyToProgram, action
// explicite jamais automatique) était invisible dans l'onglet admin Founding
// Partner — adminList ne listait que les PartnerOnboarding existants. Sans
// endroit où le retrouver, l'admin ne pouvait jamais le relancer.
describe("adminList — entités partenaire sans aucun dossier Founding Partner", () => {
  it("inclut une entité PartnerBusiness sans PartnerOnboarding, marquée noDossier", async () => {
    const partner = await createUser({ role: "partenaire" });
    const biz = await makeTestPartnerBusiness(partner._id, { companyName: "Orpheline SARL" });

    const { req, res } = mockReqRes({ query: { limit: "100" } });
    await adminList(req, res);

    expect(res.statusCode).toBe(200);
    const orphan = res.body.onboardings.find((o) => String(o._id) === String(biz._id));
    expect(orphan).toBeTruthy();
    expect(orphan.noDossier).toBe(true);
    expect(orphan.status).toBe("aucun_dossier");
    expect(orphan.companyInfo.legalName).toBe("Orpheline SARL");
  });

  it("n'inclut PAS une entité qui a déjà un dossier (même brouillon)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const biz = await makeTestPartnerBusiness(partner._id, { companyName: "Déjà Démarrée SARL" });
    await PartnerOnboarding.create({ userId: partner._id, businessId: biz._id, status: "brouillon" });

    const { req, res } = mockReqRes({ query: { limit: "100" } });
    await adminList(req, res);

    const orphan = res.body.onboardings.find((o) => String(o._id) === String(biz._id) && o.noDossier);
    expect(orphan).toBeUndefined();
  });

  it("n'inclut jamais l'entité d'un client (role !== partenaire)", async () => {
    const client = await createUser({ role: "client" });
    const biz = await makeTestPartnerBusiness(client._id, { companyName: "Compte Client SARL" });

    const { req, res } = mockReqRes({ query: { limit: "100" } });
    await adminList(req, res);

    const orphan = res.body.onboardings.find((o) => String(o._id) === String(biz._id));
    expect(orphan).toBeUndefined();
  });

  it("ne fusionne pas les entités orphelines si un filtre de statut est actif", async () => {
    const partner = await createUser({ role: "partenaire" });
    await makeTestPartnerBusiness(partner._id, { companyName: "Filtrée SARL" });

    const { req, res } = mockReqRes({ query: { status: "soumis" } });
    await adminList(req, res);

    expect(res.body.onboardings.every((o) => !o.noDossier)).toBe(true);
  });

  // Bug réel corrigé (audit, remonté par l'utilisateur : un compte partenaire
  // "cheng chen" invisible dans l'onglet Founding Partner) : la version
  // précédente ne partait que des PartnerBusiness déjà créées — un partenaire
  // n'ayant JAMAIS créé d'entité (ensureDefaultPartnerBusiness n'étant appelé
  // qu'à la candidature ou depuis "Mes entités") restait invisible même après
  // le premier correctif "orphanRows".
  it("inclut un compte partenaire SANS AUCUNE entité PartnerBusiness", async () => {
    const partner = await createUser({ role: "partenaire", firstName: "Cheng", lastName: "Chen" });

    const { req, res } = mockReqRes({ query: { limit: "100" } });
    await adminList(req, res);

    expect(res.statusCode).toBe(200);
    const orphan = res.body.onboardings.find((o) => String(o._id) === String(partner._id));
    expect(orphan).toBeTruthy();
    expect(orphan.noDossier).toBe(true);
    expect(orphan.hasBusiness).toBe(false);
    expect(orphan.companyInfo.legalName).toBe("Cheng Chen");
  });
});

describe("adminRelaunchBusiness", () => {
  it("404 pour une entité inexistante", async () => {
    const { req, res } = mockReqRes({ params: { businessId: "000000000000000000000000" } });
    await adminRelaunchBusiness(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("400 si l'entité a déjà un dossier Founding Partner", async () => {
    const partner = await createUser({ role: "partenaire" });
    const biz = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({ userId: partner._id, businessId: biz._id, status: "brouillon" });

    const { req, res } = mockReqRes({ params: { businessId: biz._id.toString() } });
    await adminRelaunchBusiness(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("envoie l'invitation et marque lastReminderSentAt", async () => {
    const partner = await createUser({ role: "partenaire" });
    const biz = await makeTestPartnerBusiness(partner._id);

    const { req, res } = mockReqRes({ params: { businessId: biz._id.toString() } });
    await adminRelaunchBusiness(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const reloaded = await PartnerBusiness.findById(biz._id);
    expect(reloaded.lastReminderSentAt).toBeTruthy();
  });

  // Cas "cheng chen" : adminList envoie l'ID du User lui-même quand il n'a
  // aucune PartnerBusiness — l'entité minimale doit être créée à la volée.
  it("crée l'entité minimale à la volée pour un partenaire sans aucune PartnerBusiness, puis envoie l'invitation", async () => {
    const partner = await createUser({ role: "partenaire", firstName: "Cheng", lastName: "Chen" });
    expect(await PartnerBusiness.exists({ owner: partner._id })).toBeNull();

    const { req, res } = mockReqRes({ params: { businessId: partner._id.toString() } });
    await adminRelaunchBusiness(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const created = await PartnerBusiness.findOne({ owner: partner._id });
    expect(created).toBeTruthy();
    expect(created.lastReminderSentAt).toBeTruthy();
  });
});
