import { describe, it, expect } from "vitest";
import { computeScore, computeBadge, submitLevel, adminReviewLevel, adminList, adminDetail } from "../controllers/partnerCertificationController.js";
import PartnerCertification from "../models/PartnerCertification.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const approvedLevels = (...levels) => {
  const cert = {};
  for (const l of levels) cert[`level${l}`] = { status: "approved" };
  return cert;
};

describe("computeScore / computeBadge (logique pure)", () => {
  it("aucun niveau approuvé → score 0, badge none", () => {
    expect(computeScore({})).toBe(0);
    expect(computeBadge({})).toBe("none");
  });

  it("niveaux 1-3 approuvés → badge verifie", () => {
    const cert = approvedLevels(1, 2, 3);
    expect(computeBadge(cert)).toBe("verifie");
    expect(computeScore(cert)).toBe(36); // 3 × floor(100/8) = 36
  });

  it("niveaux 1-7 approuvés → badge fondateur", () => {
    const cert = approvedLevels(1, 2, 3, 4, 5, 6, 7);
    expect(computeBadge(cert)).toBe("fondateur");
  });

  it("un badge attribué manuellement (level8) prime sur le calcul automatique", () => {
    const cert = { ...approvedLevels(1, 2, 3), level8: { badgeAwarded: "premium" } };
    expect(computeBadge(cert)).toBe("premium");
  });

  it("niveaux 1-2 seuls (pas 3) → pas encore badge verifie", () => {
    const cert = approvedLevels(1, 2);
    expect(computeBadge(cert)).toBe("none");
  });
});

describe("partnerCertificationController.submitLevel", () => {
  it("refuse un rôle non-partenaire", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, params: { level: "1" }, body: { companyName: "Test SARL" } });
    await submitLevel(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("PARTNER_ONLY");
  });

  it("refuse un niveau hors de la plage 1-7", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, params: { level: "9" }, body: {} });
    await submitLevel(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse le niveau 7 (signature) tant que les niveaux 1-6 ne sont pas tous approuvés", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerCertification.create({ userId: partner._id, ...approvedLevels(1, 2, 3, 4, 5) }); // niveau 6 manquant
    const { req, res } = mockReqRes({ user: partner, params: { level: "7" }, body: { agreedToGCU: true } });
    await submitLevel(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("ignore silencieusement les champs non autorisés pour ce niveau (anti mass-assignment)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({
      user: partner,
      params: { level: "1" },
      // iban n'appartient qu'au niveau 4, pas au niveau 1 — ne doit jamais être stocké ici.
      body: { companyName: "Test SARL", country: "CI", iban: "FR7612345" },
    });
    await submitLevel(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.certification.level1.companyName).toBe("Test SARL");
    expect(res.body.certification.level1.iban).toBeUndefined();
    expect(res.body.certification.level1.status).toBe("submitted");
  });
});

describe("partnerCertificationController.adminReviewLevel — boucle jusqu'au badge réel sur User", () => {
  it("approuver les niveaux 1 à 3 attribue le badge 'verifie' et le propage sur le compte User", async () => {
    const partner = await createUser({ role: "partenaire", certificationBadge: "none" });
    const admin = await createUser({ role: "admin" });
    const cert = await PartnerCertification.create({ userId: partner._id, ...approvedLevelsSubmitted(1, 2, 3) });

    for (const level of [1, 2, 3]) {
      const { req, res } = mockReqRes({ user: admin, params: { userId: partner._id.toString(), level: String(level) }, body: { decision: "approved" } });
      await adminReviewLevel(req, res);
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(404);
    }

    const updatedUser = await User.findById(partner._id);
    expect(updatedUser.certificationBadge).toBe("verifie");

    const updatedCert = await PartnerCertification.findById(cert._id);
    expect(updatedCert.overallStatus).toBe("approved");
    expect(updatedCert.certificationBadge).toBe("verifie");
  });

  it("un refus enregistre le motif et ne débloque pas le badge", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    await PartnerCertification.create({ userId: partner._id, ...approvedLevelsSubmitted(1) });

    const { req, res } = mockReqRes({
      user: admin, params: { userId: partner._id.toString(), level: "1" },
      body: { decision: "rejected", note: "RCCM illisible" },
    });
    await adminReviewLevel(req, res);

    const updatedCert = await PartnerCertification.findOne({ userId: partner._id });
    expect(updatedCert.level1.status).toBe("rejected");
    expect(updatedCert.level1.rejectionReason).toBe("RCCM illisible");

    const updatedUser = await User.findById(partner._id);
    expect(updatedUser.certificationBadge).toBe("none");
  });

  // Bug réel corrigé (audit) : sans branche `else`, rejeter un niveau 1-3
  // APRÈS que overallStatus soit passé à "approved" ne le faisait jamais
  // redescendre — le dossier restait affiché "approved" partout (Vue de
  // confiance admin, profil public) alors qu'il n'est plus valide.
  it("rejeter un niveau APRÈS approbation complète fait redescendre overallStatus (pas figé sur 'approved')", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    await PartnerCertification.create({ userId: partner._id, ...approvedLevelsSubmitted(1, 2, 3) });

    for (const level of [1, 2, 3]) {
      const { req, res } = mockReqRes({ user: admin, params: { userId: partner._id.toString(), level: String(level) }, body: { decision: "approved" } });
      await adminReviewLevel(req, res);
    }
    const approvedCert = await PartnerCertification.findOne({ userId: partner._id });
    expect(approvedCert.overallStatus).toBe("approved");

    // L'admin revient sur sa décision pour le niveau 2 — aucun autre niveau
    // n'est "submitted" en attente à ce moment-là.
    const { req, res } = mockReqRes({
      user: admin, params: { userId: partner._id.toString(), level: "2" },
      body: { decision: "rejected", note: "Document finalement invalide" },
    });
    await adminReviewLevel(req, res);

    const reloadedCert = await PartnerCertification.findOne({ userId: partner._id });
    expect(reloadedCert.overallStatus).not.toBe("approved");
    expect(reloadedCert.overallStatus).toBe("in_progress");
  });
});

function approvedLevelsSubmitted(...levels) {
  const cert = {};
  for (const l of levels) cert[`level${l}`] = { status: "submitted" };
  return cert;
}

// Bug réel corrigé (audit, même famille que le Founding Partner) : adminList
// ne partait que de PartnerCertification, jamais de User — un partenaire
// n'ayant jamais visité /partner-certification (upsert, getStatus) ni signé
// d'accord Founding Partner (cascade) était totalement invisible.
describe("partnerCertificationController.adminList — comptes sans aucun dossier", () => {
  it("inclut un partenaire sans PartnerCertification, marqué noDossier", async () => {
    const partner = await createUser({ role: "partenaire", firstName: "Cheng", lastName: "Chen" });
    const { req, res } = mockReqRes({ query: {} });
    await adminList(req, res);

    expect(res.statusCode).toBe(200);
    const orphan = res.body.certifications.find((c) => String(c._id) === String(partner._id));
    expect(orphan).toBeTruthy();
    expect(orphan.noDossier).toBe(true);
    expect(orphan.certificationBadge).toBe("none");
  });

  it("n'inclut pas un partenaire ayant déjà un dossier", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerCertification.create({ userId: partner._id });
    const { req, res } = mockReqRes({ query: {} });
    await adminList(req, res);

    const orphan = res.body.certifications.find((c) => String(c._id) === String(partner._id) && c.noDossier);
    expect(orphan).toBeUndefined();
  });

  it("ne fusionne pas si un filtre de statut/badge est actif", async () => {
    await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ query: { badge: "verifie" } });
    await adminList(req, res);
    expect(res.body.certifications.every((c) => !c.noDossier)).toBe(true);
  });
});

describe("partnerCertificationController.adminDetail — création à la volée", () => {
  it("crée le dossier à la volée pour un partenaire sans aucun dossier (au lieu de 404)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ params: { userId: partner._id.toString() } });
    await adminDetail(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.certification.userId._id.toString()).toBe(partner._id.toString());
    const created = await PartnerCertification.findOne({ userId: partner._id });
    expect(created).toBeTruthy();
  });

  it("404 pour un utilisateur inexistant", async () => {
    const { req, res } = mockReqRes({ params: { userId: "000000000000000000000000" } });
    await adminDetail(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("404 pour un utilisateur qui n'est pas partenaire", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ params: { userId: client._id.toString() } });
    await adminDetail(req, res);
    expect(res.statusCode).toBe(404);
  });
});
