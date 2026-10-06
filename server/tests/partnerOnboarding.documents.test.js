import { describe, it, expect, vi } from "vitest";

// Stockage privé simulé : en test, ImageKit n'est pas configuré et
// deposerPiece retomberait sur le data URI — on vérifie ici le vrai chemin.
vi.mock("../config/imagekit.js", async (orig) => {
  const vrai = await orig();
  return {
    ...vrai,
    isImageKitConfigured: () => true,
    uploadDocument: vi.fn(async (_src, dossier, nom) => ({ url: `https://ik.imagekit.io/vitauto/${dossier}/${nom}.pdf` })),
  };
});

const { updateSection } = await import("../controllers/partnerOnboardingController.js");
const { default: PartnerOnboarding } = await import("../models/PartnerOnboarding.js");
const { createUser } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

// Dossier BENTCHICH CAR (2026-10-06) : les documents d'entreprise étaient
// écrits en base64 DANS le dossier — au-delà de 16 Mo, échec en 500, dossier
// resté vide. Ils partent désormais sur le stockage privé.
const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");

describe("Portail partenaire — documents d'entreprise", () => {
  it("dépose le registre de commerce sur le stockage privé et n'écrit que son URL", async () => {
    const p = await createUser({ role: "partenaire", sellerType: "entreprise", partnerActivity: "loueur", country: "MA" });
    const { req, res } = mockReqRes({ user: p, params: { sectionName: "legal-docs" }, body: { businessRegistration: PDF } });
    await updateSection(req, res);
    expect(res.statusCode).toBe(200);
    const doc = await PartnerOnboarding.findOne({ userId: p._id });
    expect(doc.legalDocs.businessRegistration).toMatch(/^https:\/\/ik\.imagekit\.io\/vitauto\/vit-auto\/docs\/onboarding_/);
    expect(String(doc.legalDocs.businessRegistration).startsWith("data:")).toBe(false);
  });

  it("refuse toujours un fichier qui n'est ni une image ni un PDF", async () => {
    const p = await createUser({ role: "partenaire", sellerType: "entreprise", partnerActivity: "loueur", country: "MA" });
    const faux = "data:application/pdf;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64");
    const { req, res } = mockReqRes({ user: p, params: { sectionName: "legal-docs" }, body: { taxCertificate: faux } });
    await updateSection(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("Candidature importateur — pièces justificatives", () => {
  it("dépose les pièces sur le stockage privé et accepte une nouvelle candidature après refus", async () => {
    const { submitImporterProfile } = await import("../controllers/importExportController.js");
    const { default: ImporterPartnerProfile } = await import("../models/ImporterPartnerProfile.js");
    const p = await createUser({ role: "partenaire", partnerActivity: "exportateur", country: "CN" });
    let m = mockReqRes({ user: p, body: { companyName: "Chelian", documents: { rccmImage: PDF } } });
    await submitImporterProfile(m.req, m.res);
    expect([200, 201]).toContain(m.res.statusCode);
    let prof = await ImporterPartnerProfile.findOne({ userId: p._id });
    expect(prof.documents.rccmImage).toMatch(/^https:\/\/ik\.imagekit\.io\//);

    await ImporterPartnerProfile.updateOne({ _id: prof._id }, { $set: { status: "rejected" } });
    m = mockReqRes({ user: p, body: { companyName: "Chelian", documents: { taxIdImage: PDF } } });
    await submitImporterProfile(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    prof = await ImporterPartnerProfile.findOne({ userId: p._id });
    expect(prof.documents.rccmImage).toMatch(/^https:/);   // conservée
    expect(prof.documents.taxIdImage).toMatch(/^https:/);  // ajoutée
    expect(prof.status).toBe("pending");
  });
});

describe("Admin — ajout d'un document au dossier d'un partenaire", () => {
  it("ouvre le dossier, dépose la pièce, coche « documents reçus » et la recopie dans le dossier Fondateur", async () => {
    const { adminAddDocument } = await import("../controllers/partnerVerificationController.js");
    const { default: PartnerVerification } = await import("../models/PartnerVerification.js");
    const { default: PartnerBusiness } = await import("../models/PartnerBusiness.js");
    const p = await createUser({ role: "partenaire", sellerType: "entreprise", partnerActivity: "loueur", country: "MA" });
    await PartnerBusiness.create({ owner: p._id, companyName: "BENTCHICHCAR", country: "MA", ville: "Rabat", isDefault: true });
    await PartnerOnboarding.create({ userId: p._id, country: "MA" });
    const admin = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({ user: admin, params: { userId: p._id.toString() }, body: { champ: "rccmDoc", fichier: PDF } });
    await adminAddDocument(req, res);
    expect(res.statusCode).toBe(200);

    const pv = await PartnerVerification.findOne({ userId: p._id });
    expect(pv.companyName).toBe("BENTCHICHCAR");
    expect(pv.companyType).toBe("loueur");
    expect(pv.documents.rccmDoc).toMatch(/^https:\/\/ik\.imagekit\.io\/vitauto\/vit-auto\/docs\/verification_/);
    expect(pv.criteria.documentsReceived.verified).toBe(true);
    expect(pv.criteria.businessLicense.verified).toBe(false); // décision de fond laissée à l'admin
    const onb = await PartnerOnboarding.findOne({ userId: p._id });
    expect(onb.legalDocs.businessRegistration).toBe(pv.documents.rccmDoc);
  });

  it("refuse un type de document inconnu et un fichier invalide", async () => {
    const { adminAddDocument } = await import("../controllers/partnerVerificationController.js");
    const p = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    let m = mockReqRes({ user: admin, params: { userId: p._id.toString() }, body: { champ: "licorne", fichier: PDF } });
    await adminAddDocument(m.req, m.res); expect(m.res.statusCode).toBe(400);
    m = mockReqRes({ user: admin, params: { userId: p._id.toString() }, body: { champ: "rccmDoc", fichier: "data:application/pdf;base64,AAAA" } });
    await adminAddDocument(m.req, m.res); expect(m.res.statusCode).toBe(400);
  });
});
