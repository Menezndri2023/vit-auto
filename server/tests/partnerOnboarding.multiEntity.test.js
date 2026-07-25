import { describe, it, expect } from "vitest";
import {
  applyToProgram, getMyOnboarding, getMyOnboardingAll, updateActivity,
} from "../controllers/partnerOnboardingController.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("Founding Partner Program par entité — multi-entités", () => {
  it("applyToProgram crée une entité par défaut quand le partenaire n'en a aucune", async () => {
    const partner = await createUser({ role: "partenaire", country: "CI" });
    const { req, res } = mockReqRes({ user: partner });
    await applyToProgram(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.onboarding.businessId).toBeTruthy();
  });

  it("un partenaire avec 2 entités obtient 2 dossiers indépendants", async () => {
    const partner = await createUser({ role: "partenaire", country: "CI" });
    const businessA = await makeTestPartnerBusiness(partner._id, { companyName: "Entité A", isDefault: true });
    const businessB = await makeTestPartnerBusiness(partner._id, { companyName: "Entité B", isDefault: false });

    const applyA = mockReqRes({ user: partner, body: { businessId: businessA._id.toString() } });
    await applyToProgram(applyA.req, applyA.res);
    expect(applyA.res.statusCode).toBe(201);
    expect(String(applyA.res.body.onboarding.businessId)).toBe(String(businessA._id));

    const applyB = mockReqRes({ user: partner, body: { businessId: businessB._id.toString() } });
    await applyToProgram(applyB.req, applyB.res);
    expect(applyB.res.statusCode).toBe(201);
    expect(String(applyB.res.body.onboarding.businessId)).toBe(String(businessB._id));

    const total = await PartnerOnboarding.countDocuments({ userId: partner._id });
    expect(total).toBe(2);
  });

  it("getMyOnboarding sans businessId résout automatiquement l'entité par défaut", async () => {
    const partner = await createUser({ role: "partenaire", country: "CI" });
    const businessA = await makeTestPartnerBusiness(partner._id, { companyName: "Entité par défaut", isDefault: true });
    await PartnerOnboarding.create({ userId: partner._id, businessId: businessA._id, status: "brouillon" });

    const { req, res } = mockReqRes({ user: partner });
    await getMyOnboarding(req, res);
    expect(res.statusCode).toBe(200);
    expect(String(res.body.onboarding.businessId)).toBe(String(businessA._id));
  });

  it("getMyOnboarding avec ?businessId= cible le bon dossier parmi plusieurs", async () => {
    const partner = await createUser({ role: "partenaire", country: "CI" });
    const businessA = await makeTestPartnerBusiness(partner._id, { companyName: "Entité A" });
    const businessB = await makeTestPartnerBusiness(partner._id, { companyName: "Entité B" });
    await PartnerOnboarding.create({ userId: partner._id, businessId: businessA._id, status: "brouillon", activity: "loueur" });
    await PartnerOnboarding.create({ userId: partner._id, businessId: businessB._id, status: "soumis", activity: "vendeur" });

    const { req, res } = mockReqRes({ user: partner, query: { businessId: businessB._id.toString() } });
    await getMyOnboarding(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.onboarding.status).toBe("soumis");
    expect(res.body.onboarding.activity).toBe("vendeur");
  });

  it("getMyOnboardingAll liste tous les dossiers du partenaire avec leur entité peuplée", async () => {
    const partner = await createUser({ role: "partenaire", country: "CI" });
    const businessA = await makeTestPartnerBusiness(partner._id, { companyName: "Entité A" });
    const businessB = await makeTestPartnerBusiness(partner._id, { companyName: "Entité B" });
    await PartnerOnboarding.create({ userId: partner._id, businessId: businessA._id, status: "brouillon" });
    await PartnerOnboarding.create({ userId: partner._id, businessId: businessB._id, status: "soumis" });

    const { req, res } = mockReqRes({ user: partner });
    await getMyOnboardingAll(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.onboardings).toHaveLength(2);
    const names = res.body.onboardings.map((o) => o.businessId.companyName).sort();
    expect(names).toEqual(["Entité A", "Entité B"]);
  });

  it("updateActivity ne modifie que le dossier de l'entité ciblée", async () => {
    const partner = await createUser({ role: "partenaire", country: "CI" });
    const businessA = await makeTestPartnerBusiness(partner._id, { companyName: "Entité A" });
    const businessB = await makeTestPartnerBusiness(partner._id, { companyName: "Entité B" });
    const docA = await PartnerOnboarding.create({ userId: partner._id, businessId: businessA._id, status: "brouillon" });
    const docB = await PartnerOnboarding.create({ userId: partner._id, businessId: businessB._id, status: "brouillon" });

    const { req, res } = mockReqRes({ user: partner, body: { activity: "chauffeur", businessId: businessB._id.toString() } });
    await updateActivity(req, res);
    expect(res.statusCode).toBe(200);

    const reloadedA = await PartnerOnboarding.findById(docA._id);
    const reloadedB = await PartnerOnboarding.findById(docB._id);
    expect(reloadedA.activity).toBe(null);
    expect(reloadedB.activity).toBe("chauffeur");
  });
});
