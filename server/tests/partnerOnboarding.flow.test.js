import { describe, it, expect } from "vitest";
import { submitApplication, adminApprove, signLOI } from "../controllers/partnerOnboardingController.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { createUser, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const legalAcceptance = { accepted: true, acceptedAt: new Date(), ip: "127.0.0.1" };

describe("partnerOnboardingController.submitApplication", () => {
  it("refuse un particulier sans pièce justificative", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({ userId: partner._id, businessId: business._id, status: "brouillon", legalEntityType: "particulier", legalAcceptance });
    const { req, res } = mockReqRes({ user: partner });
    await submitApplication(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse une entreprise sans nom légal ni aucun document légal", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({ userId: partner._id, businessId: business._id, status: "brouillon", legalEntityType: "entreprise", legalAcceptance });
    const { req, res } = mockReqRes({ user: partner });
    await submitApplication(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse tant que la LOI/l'Accord/la Politique de vérification n'ont pas été acceptés", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({
      userId: partner._id, businessId: business._id, status: "brouillon", legalEntityType: "particulier",
      individualDoc: { type: "cni", file: "data:..." },
    });
    const { req, res } = mockReqRes({ user: partner });
    await submitApplication(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("accepte un particulier avec pièce justificative et acceptation légale", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({
      userId: partner._id, businessId: business._id, status: "brouillon", legalEntityType: "particulier",
      individualDoc: { type: "cni", file: "data:..." }, legalAcceptance,
    });
    const { req, res } = mockReqRes({ user: partner });
    await submitApplication(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const updated = await PartnerOnboarding.findOne({ userId: partner._id, businessId: business._id });
    expect(updated.status).toBe("soumis");
  });

  it("refuse une deuxième soumission d'un dossier déjà soumis", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({ userId: partner._id, businessId: business._id, status: "soumis", legalEntityType: "particulier" });
    const { req, res } = mockReqRes({ user: partner });
    await submitApplication(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // Le programme Founding Partner est devenu le parcours obligatoire de TOUT
  // partenaire (voir Register.jsx) — l'ancien plafond de 20 candidatures actives
  // par pays a été retiré (il bloquerait sinon les inscriptions dès le 21e
  // partenaire d'un pays). Ce test remplace les deux anciens tests de plafond.
  it("accepte la soumission même avec 20 dossiers déjà actifs dans le même pays (plus de plafond)", async () => {
    for (let i = 0; i < 20; i++) {
      const u = await createUser({ role: "partenaire" });
      const b = await makeTestPartnerBusiness(u._id);
      await PartnerOnboarding.create({ userId: u._id, businessId: b._id, status: "soumis", country: "CI", legalEntityType: "particulier" });
    }

    const partner = await createUser({ role: "partenaire", country: "CI" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({
      userId: partner._id, businessId: business._id, status: "brouillon", country: "CI", legalEntityType: "particulier",
      individualDoc: { type: "cni", file: "data:..." }, legalAcceptance,
    });

    const { req, res } = mockReqRes({ user: partner });
    await submitApplication(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const updated = await PartnerOnboarding.findOne({ userId: partner._id, businessId: business._id });
    expect(updated.status).toBe("soumis");
  });
});

describe("partnerOnboardingController — chaîne adminApprove → signLOI (jusqu'à l'Accord prêt à signer)", () => {
  it("adminApprove refuse un dossier qui n'est pas en attente de validation", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    const doc = await PartnerOnboarding.create({ userId: partner._id, businessId: business._id, status: "brouillon" });
    const admin = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: {} });
    await adminApprove(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("signLOI refuse tant que la LOI n'a pas été envoyée par un admin", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    await PartnerOnboarding.create({ userId: partner._id, businessId: business._id, status: "soumis" });
    const { req, res } = mockReqRes({ user: partner, body: { signerName: "Jean Dupont" } });
    await signLOI(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("approuver puis signer la LOI enchaîne automatiquement sur un Accord prêt à signer", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    const doc = await PartnerOnboarding.create({
      userId: partner._id, businessId: business._id, status: "soumis",
      companyInfo: { legalName: "Test SARL", registrationCountry: "CI" },
    });
    const admin = await createUser({ role: "admin" });

    const approve = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: { note: "OK" } });
    await adminApprove(approve.req, approve.res);
    expect(approve.res.status).not.toHaveBeenCalledWith(400);
    expect(approve.res.body.status).toBe("loi_envoyee");

    const afterApproval = await PartnerOnboarding.findOne({ userId: partner._id, businessId: business._id });
    expect(afterApproval.loi.signingToken).toBeTruthy();

    const sign = mockReqRes({ user: partner, body: { signerName: "Jean Dupont", signerPosition: "Gérant" } });
    await signLOI(sign.req, sign.res);
    expect(sign.res.status).not.toHaveBeenCalledWith(400);

    const afterLoi = await PartnerOnboarding.findOne({ userId: partner._id, businessId: business._id });
    // L'Accord est généré et envoyé automatiquement dans la foulée — le
    // partenaire n'a besoin que d'une seule visite pour signer les deux documents.
    expect(afterLoi.status).toBe("accord_envoye");
    expect(afterLoi.agreement.content).toBeTruthy();
    expect(afterLoi.loi.signedAt).toBeTruthy();
  });
});
