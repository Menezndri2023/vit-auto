import { describe, it, expect } from "vitest";
import { computeTrustScore, computeTrustLevel } from "../models/PartnerVerification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { adminToggleCriterion, adminUpdateStatus, getMine } from "../controllers/partnerVerificationController.js";
import { createVehicle } from "../controllers/vehicleController.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("computeTrustScore / computeTrustLevel (logique pure)", () => {
  it("aucun critère vérifié → score 0, niveau non_verifie", () => {
    expect(computeTrustScore({})).toBe(0);
    expect(computeTrustLevel(0)).toBe("non_verifie");
  });

  it("tous les critères vérifiés → score 100 (les poids totalisent exactement 100)", () => {
    const criteria = {
      businessLicense: { verified: true }, repIdentified: { verified: true }, exportCapacity: { verified: true },
      documentsReceived: { verified: true }, addressVerified: { verified: true }, websiteVerified: { verified: true },
      verificationDone: { verified: true },
    };
    expect(computeTrustScore(criteria)).toBe(100);
    expect(computeTrustLevel(100)).toBe("platine");
  });

  it.each([[24, "non_verifie"], [25, "bronze"], [49, "bronze"], [50, "argent"], [74, "argent"], [75, "or"], [94, "or"], [95, "platine"]])(
    "score %i → niveau %s",
    (score, level) => expect(computeTrustLevel(score)).toBe(level)
  );
});

describe("partnerVerificationController.adminToggleCriterion", () => {
  it("refuse un critère inconnu", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerVerification.create({ userId: partner._id, companyName: "Test SARL" });
    const admin = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({ user: admin, params: { userId: partner._id.toString() }, body: { criterion: "n_importe_quoi", verified: true } });
    await adminToggleCriterion(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("valider tous les critères fait automatiquement passer le statut à 'verifie'", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerVerification.create({ userId: partner._id, companyName: "Test SARL", status: "en_cours" });
    const admin = await createUser({ role: "admin" });

    const criteria = ["businessLicense", "repIdentified", "exportCapacity", "documentsReceived", "addressVerified", "websiteVerified", "verificationDone"];
    let lastRes;
    for (const criterion of criteria) {
      const { req, res } = mockReqRes({ user: admin, params: { userId: partner._id.toString() }, body: { criterion, verified: true } });
      await adminToggleCriterion(req, res);
      lastRes = res;
    }

    expect(lastRes.body.trustScore).toBe(100);
    const updated = await PartnerVerification.findOne({ userId: partner._id });
    expect(updated.status).toBe("verifie");
    expect(updated.trustLevel).toBe("platine");
  });
});

describe("partnerVerificationController.adminUpdateStatus — boucle jusqu'au blocage réel de publication", () => {
  it("suspendre un partenaire via ce endpoint bloque ensuite vehicleController.createVehicle (PARTNER_SUSPENDED)", async () => {
    const partner = await createUser({ role: "partenaire", isFounder: true }); // isFounder pour isoler du gate KYC/CERTIFICATION
    await PartnerVerification.create({ userId: partner._id, companyName: "Test SARL", status: "en_cours" });
    const admin = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({ user: admin, params: { userId: partner._id.toString() }, body: { status: "suspendu", adminNote: "Documents douteux" } });
    await adminUpdateStatus(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.verification.status).toBe("suspendu");

    // Le partenaire suspendu tente de publier un véhicule — doit être bloqué,
    // alors même qu'il est Founding Partner (donc exempté du gate KYC/certification).
    const { req: vReq, res: vRes } = mockReqRes({ user: partner, body: { title: "Toyota Corolla 2020", type: "vente" } });
    await createVehicle(vReq, vRes);
    expect(vRes.status).toHaveBeenCalledWith(403);
    expect(vRes.body.code).toBe("PARTNER_SUSPENDED");
  });

  it("refuse un statut invalide", async () => {
    const partner = await createUser({ role: "partenaire" });
    await PartnerVerification.create({ userId: partner._id, companyName: "Test SARL" });
    const admin = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({ user: admin, params: { userId: partner._id.toString() }, body: { status: "banni" } });
    await adminUpdateStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("getMine — vue de confiance personnelle du partenaire", () => {
  it("répond un état vide (pas d'erreur) si aucun dossier n'a encore été ouvert", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: { id: partner._id } });
    await getMine(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verification).toBeNull();
    expect(res.body.criteriaWeights.businessLicense).toBe(20);
  });

  it("expose ses propres critères, y compris la note d'un critère refusé", async () => {
    const partner = await createUser({ role: "partenaire" });
    const other = await createUser({ role: "partenaire" });
    await PartnerVerification.create({
      userId: other._id, companyName: "Autre SARL",
      criteria: { businessLicense: { verified: false, note: "Document illisible" } },
    });
    await PartnerVerification.create({
      userId: partner._id, companyName: "Test SARL",
      criteria: {
        businessLicense: { verified: true },
        addressVerified:  { verified: false, note: "Adresse introuvable sur la facture fournie" },
      },
      adminNote: "Note interne confidentielle",
    });

    const { req, res } = mockReqRes({ user: { id: partner._id } });
    await getMine(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verification.companyName).toBe("Test SARL");
    // trustScore recalculé automatiquement par le hook pre("save") du modèle à
    // partir des poids des critères vérifiés (businessLicense=20), jamais lu
    // tel quel depuis l'input — comportement du modèle, pas de ce controller.
    expect(res.body.verification.trustScore).toBe(20);
    expect(res.body.verification.criteria.businessLicense.verified).toBe(true);
    expect(res.body.verification.criteria.addressVerified.note).toBe("Adresse introuvable sur la facture fournie");
    // Champs internes admin non exposés au partenaire.
    expect(res.body.verification.adminNote).toBeUndefined();
  });
});
