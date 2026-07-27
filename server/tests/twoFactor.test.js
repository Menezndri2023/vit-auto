import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { setup2FA, enable2FA, disable2FA } from "../controllers/authController.js";
import { decryptField } from "../utils/fieldEncryption.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const PASSWORD = "correct-horse-battery";
const withPassword = async (overrides = {}) =>
  createUser({ password: await bcrypt.hash(PASSWORD, 12), emailVerified: true, ...overrides });

// Reproduit exactement buildTotp() (server/controllers/authController.js) —
// même paramètres que le helper équivalent dans auth.security.test.js.
function totpFor(secret, email) {
  return new OTPAuth.TOTP({
    issuer: "VIT AUTO", label: email, algorithm: "SHA1", digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

describe("2FA — setup / enable / disable (couverture manquante, comportement pré-existant non modifié)", () => {
  it("setup2FA génère un secret + QR code sans encore activer le 2FA", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({ user });
    await setup2FA(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.secret).toBeTruthy();
    expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);

    // Chiffré au repos (audit sécurité) : jamais stocké tel quel en base,
    // mais bien déchiffrable vers la valeur renvoyée au client.
    const reloaded = await User.findById(user._id);
    expect(reloaded.twoFactor.secret).not.toBe(res.body.secret);
    expect(decryptField(reloaded.twoFactor.secret)).toBe(res.body.secret);
    expect(reloaded.twoFactor.enabled).toBe(false);
  });

  it("refuse un nouveau setup si le 2FA est déjà activé", async () => {
    const user = await withPassword({ twoFactor: { enabled: true, secret: "JBSWY3DPEHPK3PXP" } });
    const { req, res } = mockReqRes({ user });
    await setup2FA(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("enable2FA refuse un code TOTP invalide", async () => {
    const user = await withPassword();
    const { req: setupReq, res: setupRes } = mockReqRes({ user });
    await setup2FA(setupReq, setupRes);
    const reloaded = await User.findById(user._id);

    const { req, res } = mockReqRes({ user: reloaded, body: { token: "000000" } });
    await enable2FA(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("enable2FA active le 2FA avec un code valide et renvoie 10 codes de secours", async () => {
    const user = await withPassword();
    const { req: setupReq, res: setupRes } = mockReqRes({ user });
    await setup2FA(setupReq, setupRes);
    const afterSetup = await User.findById(user._id);

    const validCode = totpFor(decryptField(afterSetup.twoFactor.secret), user.email).generate();
    const { req, res } = mockReqRes({ user: afterSetup, body: { token: validCode } });
    await enable2FA(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.backupCodes).toHaveLength(10);

    const reloaded = await User.findById(user._id);
    expect(reloaded.twoFactor.enabled).toBe(true);
    expect(reloaded.twoFactor.backupCodes).toHaveLength(10);
    // Les codes renvoyés au client sont en clair, mais jamais stockés tels quels.
    expect(reloaded.twoFactor.backupCodes[0].code).not.toBe(res.body.backupCodes[0]);
  });

  it("disable2FA exige le mot de passe et désactive proprement", async () => {
    const user = await withPassword({
      twoFactor: { enabled: true, secret: "JBSWY3DPEHPK3PXP", backupCodes: [{ code: "x", used: false }] },
    });

    const wrong = mockReqRes({ user, body: { password: "wrong" } });
    await disable2FA(wrong.req, wrong.res);
    expect(wrong.res.statusCode).toBe(401);

    const ok = mockReqRes({ user, body: { password: PASSWORD } });
    await disable2FA(ok.req, ok.res);
    expect(ok.res.statusCode).toBe(200);

    const reloaded = await User.findById(user._id);
    expect(reloaded.twoFactor.enabled).toBe(false);
    expect(reloaded.twoFactor.secret).toBeNull();
    expect(reloaded.twoFactor.backupCodes).toEqual([]);
  });
});
