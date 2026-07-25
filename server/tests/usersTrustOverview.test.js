import { describe, it, expect } from "vitest";
import { getUserTrustOverview } from "../controllers/usersController.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import Driver from "../models/Driver.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("getUserTrustOverview — clés existantes (non-régression)", () => {
  it("404 pour un utilisateur inexistant", async () => {
    const { req, res } = mockReqRes({ params: { id: "000000000000000000000000" } });
    await getUserTrustOverview(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("renvoie les clés historiques inchangées pour un compte sans aucun dossier", async () => {
    const partner = await createUser({ role: "partenaire", sellerType: "particulier" });
    const { req, res } = mockReqRes({ params: { id: partner._id.toString() } });
    await getUserTrustOverview(req, res);

    expect(res.statusCode).toBe(200);
    const { overview } = res.body;
    expect(overview.sellerType).toBe("particulier");
    expect(overview.foundingPartner).toBe(null);
    expect(overview.partnerVerification).toBe(null);
    expect(overview.partnerCertification).toBe(null);
    expect(overview.importerProfile).toBe(null);
    expect(overview.showroom).toBe(null);
  });
});

describe("getUserTrustOverview — nouvelles clés (entities/documents)", () => {
  it("entities est vide pour un partenaire sans PartnerBusiness", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ params: { id: partner._id.toString() } });
    await getUserTrustOverview(req, res);
    expect(res.body.overview.entities).toEqual([]);
  });

  it("liste chaque entité avec son dossier Founding Partner associé", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id, { companyName: "Entité A" });
    const businessB = await makeTestPartnerBusiness(partner._id, { companyName: "Entité B" });
    await PartnerOnboarding.create({ userId: partner._id, businessId: businessA._id, status: "brouillon" });
    await PartnerOnboarding.create({ userId: partner._id, businessId: businessB._id, status: "actif", isFoundingPartner: true });

    const { req, res } = mockReqRes({ params: { id: partner._id.toString() } });
    await getUserTrustOverview(req, res);

    const { entities } = res.body.overview;
    expect(entities).toHaveLength(2);
    const entA = entities.find((e) => e.business.companyName === "Entité A");
    const entB = entities.find((e) => e.business.companyName === "Entité B");
    expect(entA.onboarding.status).toBe("brouillon");
    expect(entB.onboarding.status).toBe("actif");
    expect(entB.onboarding.isFoundingPartner).toBe(true);
  });

  it("expose des indicateurs de présence de documents sans jamais renvoyer les images brutes", async () => {
    const partner = await createUser({
      role: "partenaire",
      identity: { type: "cni", status: "verified", frontImage: "SECRET_IMG", selfie: "SECRET_SELFIE" },
    });
    await Driver.create({
      owner: partner._id, firstName: "Jean", lastName: "Chauffeur", title: "Chauffeur pro",
      disponibilite: "Temps plein", zone: "Abidjan", experience: "5 ans", tarif: 20000,
      status: "approved", cv: "https://example.test/cv.pdf",
    });

    const { req, res } = mockReqRes({ params: { id: partner._id.toString() } });
    await getUserTrustOverview(req, res);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("SECRET_IMG");
    expect(raw).not.toContain("SECRET_SELFIE");
    expect(res.body.overview.documents.identityFront).toBe(true);
    expect(res.body.overview.documents.kycSelfie).toBe(true);
    expect(res.body.overview.documents.driverProfiles).toHaveLength(1);
    expect(res.body.overview.documents.driverProfiles[0].hasCv).toBe(true);
    expect(res.body.overview.documents.driverProfiles[0].name).toBe("Jean Chauffeur");
  });
});
