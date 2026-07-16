import { describe, it, expect } from "vitest";
import { submitKyc, adminReviewKyc } from "../controllers/kycController.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("kycController", () => {
  describe("submitKyc", () => {
    it("ne produit jamais kycStatus VERIFIE, même avec un dossier incomplet", async () => {
      const user = await createUser();
      const { req, res } = mockReqRes({
        user,
        body: { frontImageHash: "hash-abc", selfieUploaded: true },
      });

      await submitKyc(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.body.kycStatus).not.toBe("VERIFIE");
      expect(res.body.kycStatus).toBe("A_REVOIR_MANUELLEMENT"); // OCR absent → révision manuelle

      const updated = await User.findById(user._id);
      expect(updated.kycStatus).not.toBe("VERIFIE");
    });

    // Garde-fou explicite du controller (voir le commentaire "IMPORTANT" dans
    // kycController.js) : ocrConfidence/faceMatchScore viennent du navigateur
    // et sont falsifiables — même un dossier qui se déclare "parfait" ne doit
    // jamais s'auto-valider sans revue admin.
    it("ne s'auto-valide jamais, même avec des scores OCR/face-match falsifiés à 100%", async () => {
      const user = await createUser();
      const { req, res } = mockReqRes({
        user,
        body: {
          frontImageHash: "hash-perfect",
          selfieUploaded: true,
          faceMatchScore: 100,
          ocrData: {
            firstName: "Jean",
            lastName: "Test",
            documentNumber: "AB123456",
            birthDate: "1990-01-01",
            ocrConfidence: 100,
          },
        },
      });

      await submitKyc(req, res);

      expect(res.body.kycStatus).not.toBe("VERIFIE");
      expect(["EN_ATTENTE", "A_REVOIR_MANUELLEMENT"]).toContain(res.body.kycStatus);

      const updated = await User.findById(user._id);
      expect(updated.kycStatus).not.toBe("VERIFIE");
      expect(updated.documentsVerified).toBe(false);
    });

    it("refuse une soumission sans photo de document", async () => {
      const user = await createUser();
      const { req, res } = mockReqRes({ user, body: { selfieUploaded: true } });

      await submitKyc(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("refuse une soumission sans selfie", async () => {
      const user = await createUser();
      const { req, res } = mockReqRes({ user, body: { frontImageHash: "hash-abc" } });

      await submitKyc(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("adminReviewKyc", () => {
    it("transitionne vers VERIFIE et journalise la décision", async () => {
      const target = await createUser({ kycStatus: "A_REVOIR_MANUELLEMENT" });
      const admin = await createUser({ role: "admin" });
      const { req, res } = mockReqRes({
        user: admin,
        params: { userId: target._id.toString() },
        body: { decision: "VERIFIE", note: "Documents conformes" },
      });

      await adminReviewKyc(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      const updated = await User.findById(target._id);
      expect(updated.kycStatus).toBe("VERIFIE");
      expect(updated.documentsVerified).toBe(true);
      expect(updated.kycAuditLog.at(-1).action).toBe("ADMIN_APPROVED");
    });

    it("transitionne vers REFUSE avec motif", async () => {
      const target = await createUser({ kycStatus: "EN_ATTENTE" });
      const admin = await createUser({ role: "admin" });
      const { req, res } = mockReqRes({
        user: admin,
        params: { userId: target._id.toString() },
        body: { decision: "REFUSE", note: "Photo illisible" },
      });

      await adminReviewKyc(req, res);

      const updated = await User.findById(target._id);
      expect(updated.kycStatus).toBe("REFUSE");
      expect(updated.kycRejectionReason).toBe("Photo illisible");
    });

    it("refuse une décision invalide", async () => {
      const target = await createUser();
      const admin = await createUser({ role: "admin" });
      const { req, res } = mockReqRes({
        user: admin,
        params: { userId: target._id.toString() },
        body: { decision: "APPROVED_BUT_NOT_A_REAL_STATUS" },
      });

      await adminReviewKyc(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("refuse l'accès à un non-admin", async () => {
      const target = await createUser();
      const notAdmin = await createUser({ role: "client" });
      const { req, res } = mockReqRes({
        user: notAdmin,
        params: { userId: target._id.toString() },
        body: { decision: "VERIFIE" },
      });

      await adminReviewKyc(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
