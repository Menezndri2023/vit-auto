import { describe, it, expect } from "vitest";
import { upsertShowroom, publishShowroom, getPublicShowroom } from "../controllers/pmsController.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("pmsController — showroom", () => {
  it("upsertShowroom crée puis met à jour le même document (jamais de doublon)", async () => {
    const partner = await createUser({ role: "partenaire" });

    const create = mockReqRes({ user: partner, body: { companyName: "Test SARL", city: "Abidjan" } });
    await upsertShowroom(create.req, create.res);
    expect(create.res.body.companyName).toBe("Test SARL");

    const update = mockReqRes({ user: partner, body: { companyName: "Test SARL 2" } });
    await upsertShowroom(update.req, update.res);
    expect(update.res.body.companyName).toBe("Test SARL 2");
    expect(update.res.body._id.toString()).toBe(create.res.body._id.toString());

    expect(await PartnerShowroom.countDocuments({ partnerId: partner._id })).toBe(1);
  });

  it("ignore les champs non autorisés (ex: isPublished ne se force pas via upsertShowroom)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { companyName: "Test SARL", isPublished: true, partnerId: "000000000000000000000000" } });
    await upsertShowroom(req, res);

    expect(res.body.isPublished).toBeFalsy();
    expect(res.body.partnerId.toString()).toBe(partner._id.toString());
  });

  it("publishShowroom fonctionne même si le showroom n'existe pas encore (upsert)", async () => {
    // isFounder:true contourne la garde de vérification (voir tests dédiés
    // ci-dessous) — ce test isole le comportement d'upsert, pas la garde.
    const partner = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: partner, body: {} });
    await publishShowroom(req, res);

    expect(res.body.isPublished).toBe(true);
    expect(res.body.publishedAt).toBeTruthy();
  });

  it("publishShowroom refuse un particulier non vérifié KYC (403 KYC_REQUIRED)", async () => {
    const partner = await createUser({ role: "partenaire", sellerType: "particulier", kycStatus: "EN_ATTENTE" });
    const { req, res } = mockReqRes({ user: partner, body: {} });
    await publishShowroom(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("KYC_REQUIRED");
    expect(await PartnerShowroom.countDocuments({ partnerId: partner._id })).toBe(0);
  });

  it("publishShowroom refuse une entreprise non certifiée (403 CERTIFICATION_REQUIRED)", async () => {
    const partner = await createUser({ role: "partenaire", sellerType: "entreprise", certificationBadge: "none" });
    const { req, res } = mockReqRes({ user: partner, body: {} });
    await publishShowroom(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("CERTIFICATION_REQUIRED");
  });

  it("getPublicShowroom refuse un showroom non publié (404, pas une fuite de données)", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerShowroom.create({ partnerId: partner._id, companyName: "Test SARL", isPublished: false });

    const { req, res } = mockReqRes({ params: { id: partner._id.toString() } });
    await getPublicShowroom(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("getPublicShowroom accessible par partnerId ou par slug une fois publié, et incrémente viewCount", async () => {
    const partner = await createUser({ role: "partenaire" });
    const showroom = await PartnerShowroom.create({
      partnerId: partner._id, companyName: "Test SARL", isPublished: true, slug: "test-sarl", viewCount: 0,
    });

    const byId = mockReqRes({ params: { id: partner._id.toString() } });
    await getPublicShowroom(byId.req, byId.res);
    expect(byId.res.status).not.toHaveBeenCalledWith(404);
    expect(byId.res.body.companyName).toBe("Test SARL");
    expect(byId.res.body.partnerInfo).toBeTruthy();

    const bySlug = mockReqRes({ params: { id: "test-sarl" } });
    await getPublicShowroom(bySlug.req, bySlug.res);
    expect(bySlug.res.status).not.toHaveBeenCalledWith(404);
    expect(bySlug.res.body.companyName).toBe("Test SARL");

    // Laisse le temps à l'incrément non-bloquant (findByIdAndUpdate sans await côté controller) de s'appliquer.
    await new Promise((r) => setTimeout(r, 50));
    const updated = await PartnerShowroom.findById(showroom._id);
    expect(updated.viewCount).toBeGreaterThan(0);
  });
});
