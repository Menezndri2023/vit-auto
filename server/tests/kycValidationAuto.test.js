import { describe, it, expect } from "vitest";

// Règle de l'exploitant (2026-10-07) : validation automatique seulement si
// e-mail OU téléphone confirmé ET dossier complet ; sinon validation manuelle.
const { processOcrJob } = await import("../queue/workers/ocr.worker.js");
const { createUser } = await import("./helpers/fixtures.js");
const { default: User } = await import("../models/User.js");
const { default: Notification } = await import("../models/Notification.js");

const dossier = (identity = {}) => ({
  kycStatus: "EN_ATTENTE",
  kycOcrData: { documentNumber: "AB123456", ocrConfidence: 90, firstName: "A", lastName: "B", birthDate: "1990-01-01" },
  kycFaceMatchScore: 92,
  identity: { type: "cni", frontImage: "f.jpg", backImage: "b.jpg", selfie: "s.jpg", expiryDate: new Date(Date.now() + 365 * 864e5), ...identity },
});
const valider = async (u) => {
  await processOcrJob({ data: { type: "validate_kyc_data", userId: u._id.toString() } });
  return User.findById(u._id).lean();
};

describe("validation automatique du KYC", () => {
  it("valide un compte au téléphone confirmé (sans e-mail confirmé) au dossier complet, et le prévient", async () => {
    const u = await createUser({ ...dossier(), emailVerified: false, phone: "+212600000001", phoneVerified: true });
    const apres = await valider(u);
    expect(apres.kycStatus).toBe("VERIFIE");
    expect(await Notification.countDocuments({ user: u._id, type: "kyc_approved" })).toBe(1);
  });

  it("valide un compte à l'e-mail confirmé, passeport sans verso", async () => {
    const u = await createUser({ ...dossier({ type: "passport", backImage: null }), emailVerified: true });
    expect((await valider(u)).kycStatus).toBe("VERIFIE");
  });

  it("laisse en validation manuelle sans contact confirmé", async () => {
    const u = await createUser({ ...dossier(), emailVerified: false, phoneVerified: false });
    expect((await valider(u)).kycStatus).toBe("EN_ATTENTE");
  });

  it("laisse en validation manuelle un dossier incomplet ou expiré", async () => {
    const sansSelfie = await createUser({ ...dossier({ selfie: null }), emailVerified: true });
    const sansVerso  = await createUser({ ...dossier({ backImage: null }), emailVerified: true });
    const expiree    = await createUser({ ...dossier({ expiryDate: new Date(Date.now() - 864e5) }), emailVerified: true });
    expect((await valider(sansSelfie)).kycStatus).toBe("EN_ATTENTE");
    expect((await valider(sansVerso)).kycStatus).toBe("EN_ATTENTE");
    expect((await valider(expiree)).kycStatus).toBe("EN_ATTENTE");
  });
});
