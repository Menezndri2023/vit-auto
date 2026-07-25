import { describe, it, expect } from "vitest";
import { signAgreement } from "../controllers/partnerOnboardingController.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import PartnerCertification from "../models/PartnerCertification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import ImporterPartnerProfile from "../models/ImporterPartnerProfile.js";
import User from "../models/User.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

async function createOnboardingReadyToSign(partner, overrides = {}) {
  const business = await makeTestPartnerBusiness(partner._id);
  return PartnerOnboarding.create({
    userId: partner._id,
    businessId: business._id,
    status: "accord_envoye",
    companyInfo: { legalName: "Test SARL", registrationCountry: "CI" },
    agreement: { content: "Contenu de l'accord de test" },
    commissions: { location: 8, vente: 5, chauffeur: 10 },
    ...overrides,
  });
}

describe("partnerOnboardingController.signAgreement — cascade Founding Partner", () => {
  it("refuse une signature sans nom de signataire", async () => {
    const partner = await createUser({ role: "partenaire" });
    await createOnboardingReadyToSign(partner);
    const { req, res } = mockReqRes({ user: partner, body: {} });
    await signAgreement(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse la signature si l'accord n'a pas encore été envoyé", async () => {
    const partner = await createUser({ role: "partenaire" });
    await createOnboardingReadyToSign(partner, { status: "loi_signee" });
    const { req, res } = mockReqRes({ user: partner, body: { signerName: "Jean Dupont" } });
    await signAgreement(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("signer l'accord active isFounder et déclenche la cascade complète KYC/Certification/Vérification/Importateur", async () => {
    const partner = await createUser({ role: "partenaire", kycStatus: "EN_ATTENTE", certificationBadge: "none" });
    await createOnboardingReadyToSign(partner);
    await ImporterPartnerProfile.create({ userId: partner._id, companyName: "Test SARL", status: "pending" });

    const { req, res } = mockReqRes({ user: partner, body: { signerName: "Jean Dupont", signerPosition: "Gérant" } });
    await signAgreement(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.body.success).toBe(true);

    // 1. isFounder + commissions verrouillées
    const updatedDoc = await PartnerOnboarding.findOne({ userId: partner._id });
    expect(updatedDoc.status).toBe("accord_signe");
    expect(updatedDoc.isFoundingPartner).toBe(true);
    expect(updatedDoc.commissions.lockedAt).toBeTruthy();

    const updatedUser = await User.findById(partner._id);
    expect(updatedUser.isFounder).toBe(true);

    // 2. KYC auto-vérifié au maximum
    expect(updatedUser.kycStatus).toBe("VERIFIE");
    expect(updatedUser.kycScore).toBe(100);
    expect(updatedUser.kycBadge).toBe("CERTIFIÉ");

    // 3. Certification : les 7 niveaux approuvés, badge "fondateur", propagé sur User
    const cert = await PartnerCertification.findOne({ userId: partner._id });
    expect(cert.overallStatus).toBe("approved");
    expect(cert.certificationBadge).toBe("fondateur");
    for (let n = 1; n <= 7; n++) expect(cert[`level${n}`].status).toBe("approved");
    expect(updatedUser.certificationBadge).toBe("fondateur");

    // 4. Vérification Partenaire : tous les critères validés, statut "verifie"
    const pv = await PartnerVerification.findOne({ userId: partner._id });
    expect(pv.status).toBe("verifie");
    expect(pv.trustScore).toBe(100);

    // 5. Profil Importateur existant basculé "verified"
    const importer = await ImporterPartnerProfile.findOne({ userId: partner._id });
    expect(importer.status).toBe("verified");
    expect(importer.badgeLevel).toBe("gold");
  });

  it("un badge de niveau 8 attribué avant la signature ne masque pas le badge 'fondateur' gagné par la cascade", async () => {
    const partner = await createUser({ role: "partenaire" });
    await createOnboardingReadyToSign(partner);
    await PartnerCertification.create({
      userId: partner._id,
      level8: { badgeAwarded: "verifie", status: "approved" }, // badge inférieur attribué avant la cascade
    });

    const { req, res } = mockReqRes({ user: partner, body: { signerName: "Jean Dupont" } });
    await signAgreement(req, res);

    const cert = await PartnerCertification.findOne({ userId: partner._id });
    expect(cert.certificationBadge).toBe("fondateur");
    expect(cert.level8.badgeAwarded).toBe("fondateur");
  });
});
