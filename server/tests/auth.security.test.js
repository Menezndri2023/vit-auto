import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import {
  login, changePassword, forgotPassword, resetPassword,
  refreshToken as refreshTokenCtrl, revokeRefreshToken,
  setup2FA, enable2FA, verify2FA, disable2FA,
  sendPhoneOtp, verifyPhoneOtp,
} from "../controllers/authController.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const PASSWORD = "correct-horse-battery";
const withPassword = async (overrides = {}) =>
  createUser({ password: await bcrypt.hash(PASSWORD, 12), emailVerified: true, ...overrides });

// Reproduit exactement buildTotp() (server/controllers/authController.js) pour
// générer un code valide côté test, sans dupliquer la logique du controller —
// un secret différent ou des paramètres différents produiraient un code que
// le controller rejetterait.
function totpFor(secret, email) {
  return new OTPAuth.TOTP({
    issuer: "VIT AUTO", label: email, algorithm: "SHA1", digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

describe("authController.login — verrouillage de compte", () => {
  it("verrouille le compte après 5 échecs puis rejette même le bon mot de passe", async () => {
    const user = await withPassword();

    for (let i = 0; i < 5; i++) {
      const { req, res } = mockReqRes({ body: { identifier: user.email, password: "wrong" } });
      await login(req, res);
      expect(res.statusCode).toBe(i < 4 ? 401 : 429);
    }

    const { req, res } = mockReqRes({ body: { identifier: user.email, password: PASSWORD } });
    await login(req, res);
    expect(res.statusCode).toBe(429);
    expect(res.body.message).toMatch(/verrouillé/i);
  });

  it("rejette un compte désactivé (isActive: false)", async () => {
    const user = await withPassword({ isActive: false });
    const { req, res } = mockReqRes({ body: { identifier: user.email, password: PASSWORD } });
    await login(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("connecte avec succès et réinitialise le compteur d'échecs", async () => {
    const user = await withPassword({ failedLoginAttempts: 3 });
    const { req, res } = mockReqRes({ body: { identifier: user.email, password: PASSWORD } });
    await login(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    const reloaded = await User.findById(user._id);
    expect(reloaded.failedLoginAttempts).toBe(0);
  });

  it("renvoie un challenge 2FA au lieu des tokens quand le 2FA est activé", async () => {
    const user = await withPassword({ twoFactor: { enabled: true, secret: "JBSWY3DPEHPK3PXP" } });
    const { req, res } = mockReqRes({ body: { identifier: user.email, password: PASSWORD } });
    await login(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(true);
    expect(res.body.challengeToken).toBeTruthy();
    expect(res.body.token).toBeUndefined();
  });
});

describe("2FA — setup → enable → verify → disable", () => {
  it("cycle complet avec code TOTP réel", async () => {
    const user = await withPassword();

    const setupRes = mockReqRes({ user });
    await setup2FA(setupRes.req, setupRes.res);
    expect(setupRes.res.statusCode).toBe(200);
    const { secret } = setupRes.res.body;
    expect(secret).toBeTruthy();

    // enable2FA lit user.twoFactor.secret depuis req.user — recharger le
    // document pour refléter le save() fait par setup2FA.
    const userAfterSetup = await User.findById(user._id);
    const validCode = totpFor(secret, user.email).generate();

    const enableRes = mockReqRes({ user: userAfterSetup, body: { token: validCode } });
    await enable2FA(enableRes.req, enableRes.res);
    expect(enableRes.res.statusCode).toBe(200);
    expect(enableRes.res.body.backupCodes).toHaveLength(10);
    const backupCode = enableRes.res.body.backupCodes[0];

    // Login déclenche le challenge maintenant que le 2FA est actif.
    const loginRes = mockReqRes({ body: { identifier: user.email, password: PASSWORD } });
    await login(loginRes.req, loginRes.res);
    const { challengeToken } = loginRes.res.body;
    expect(challengeToken).toBeTruthy();

    // Un code invalide ne complète pas la connexion.
    const badVerify = mockReqRes({ body: { challengeToken, token: "000000" } });
    await verify2FA(badVerify.req, badVerify.res);
    expect(badVerify.res.statusCode).toBe(401);

    // Un code de secours complète la connexion.
    const verifyRes = mockReqRes({ body: { challengeToken, token: backupCode } });
    await verify2FA(verifyRes.req, verifyRes.res);
    expect(verifyRes.res.statusCode).toBe(200);
    expect(verifyRes.res.body.token).toBeTruthy();

    // Le même code de secours ne peut pas être réutilisé.
    const reuseRes = mockReqRes({ body: { challengeToken, token: backupCode } });
    await verify2FA(reuseRes.req, reuseRes.res);
    expect(reuseRes.res.statusCode).toBe(401);

    // Désactivation : mot de passe requis.
    const userWith2FA = await User.findById(user._id);
    const badDisable = mockReqRes({ user: userWith2FA, body: { password: "wrong" } });
    await disable2FA(badDisable.req, badDisable.res);
    expect(badDisable.res.statusCode).toBe(401);

    const disableRes = mockReqRes({ user: userWith2FA, body: { password: PASSWORD } });
    await disable2FA(disableRes.req, disableRes.res);
    expect(disableRes.res.statusCode).toBe(200);
    const reloaded = await User.findById(user._id);
    expect(reloaded.twoFactor.enabled).toBe(false);
  });

  it("verify2FA rejette un challengeToken de mauvais purpose (ex: un JWT normal)", async () => {
    const user = await withPassword({ twoFactor: { enabled: true, secret: "JBSWY3DPEHPK3PXP" } });
    const jwt = (await import("jsonwebtoken")).default;
    const fakeChallenge = jwt.sign({ id: user._id, purpose: "not_2fa" }, process.env.JWT_SECRET);
    const { req, res } = mockReqRes({ body: { challengeToken: fakeChallenge, token: "123456" } });
    await verify2FA(req, res);
    expect(res.statusCode).toBe(401);
  });
});

describe("changePassword", () => {
  it("rejette un mauvais mot de passe actuel", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({ user, body: { currentPassword: "wrong", newPassword: "newpassword123" } });
    await changePassword(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("change le mot de passe, incrémente tokenVersion et vide les refreshTokens", async () => {
    const user = await withPassword({ refreshTokens: ["some-old-hash"], tokenVersion: 2 });
    const { req, res } = mockReqRes({ user, body: { currentPassword: PASSWORD, newPassword: "newpassword123" } });
    await changePassword(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();

    const reloaded = await User.findById(user._id);
    expect(reloaded.tokenVersion).toBe(3);
    expect(reloaded.refreshTokens).toEqual([]);
    expect(await bcrypt.compare("newpassword123", reloaded.password)).toBe(true);
  });
});

describe("forgotPassword — anti-énumération", () => {
  it("renvoie le même message générique pour un compte inexistant et un compte existant", async () => {
    const unknown = mockReqRes({ body: { identifier: "nobody@example.test" } });
    await forgotPassword(unknown.req, unknown.res);

    const user = await withPassword();
    const known = mockReqRes({ body: { identifier: user.email } });
    await forgotPassword(known.req, known.res);

    expect(unknown.res.body.message).toBe(known.res.body.message);
    expect(unknown.res.statusCode).toBe(200);
    expect(known.res.statusCode).toBe(200);
  });

  it("positionne bien passwordResetToken/Expires sur le compte existant", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({ body: { identifier: user.email } });
    await forgotPassword(req, res);
    const reloaded = await User.findById(user._id);
    expect(reloaded.passwordResetToken).toBeTruthy();
    expect(reloaded.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("resetPassword", () => {
  it("rejette un token invalide ou expiré", async () => {
    const { req, res } = mockReqRes({ body: { token: "does-not-exist", password: "newpassword123" } });
    await resetPassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("réinitialise le mot de passe et invalide les sessions existantes", async () => {
    const user = await withPassword({
      passwordResetToken: "valid-reset-token",
      passwordResetExpires: new Date(Date.now() + 3600_000),
      refreshTokens: ["old-hash"],
      tokenVersion: 1,
    });
    const { req, res } = mockReqRes({ body: { token: "valid-reset-token", password: "brandnewpassword" } });
    await resetPassword(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await User.findById(user._id);
    expect(reloaded.passwordResetToken).toBeNull();
    expect(reloaded.refreshTokens).toEqual([]);
    expect(reloaded.tokenVersion).toBe(2);
    expect(await bcrypt.compare("brandnewpassword", reloaded.password)).toBe(true);
  });
});

describe("refreshToken / revokeRefreshToken", () => {
  it("fait tourner le refresh token — l'ancien devient inutilisable une fois remplacé", async () => {
    const user = await withPassword();
    const { req: loginReq, res: loginRes } = mockReqRes({ body: { identifier: user.email, password: PASSWORD } });
    await login(loginReq, loginRes);
    const firstRefresh = loginRes.body.refreshToken;

    // JWT iat est à la précision de la seconde et le payload ({id}, pas de jti)
    // est constant : sans cet écart, un second appel dans la même seconde
    // produirait une chaîne strictement identique, rendant "l'ancien token
    // rejeté" trivialement vrai pour la mauvaise raison (il serait encore le
    // token courant).
    await new Promise((r) => setTimeout(r, 1100));

    const { req: r1, res: res1 } = mockReqRes({ body: { refreshToken: firstRefresh } });
    await refreshTokenCtrl(r1, res1);
    expect(res1.statusCode).toBe(200);
    const secondRefresh = res1.body.refreshToken;
    // Ne pas comparer les chaînes brutes : deux JWT signés la même seconde avec
    // le même payload ({id}, pas de jti) peuvent être strictement identiques —
    // ce qui compte est le comportement ci-dessous, pas la valeur littérale.

    // Rejouer l'ancien refresh token (déjà remplacé) doit échouer.
    const { req: r2, res: res2 } = mockReqRes({ body: { refreshToken: firstRefresh } });
    await refreshTokenCtrl(r2, res2);
    expect(res2.statusCode).toBe(401);

    // Le nouveau, lui, doit fonctionner.
    const { req: r3, res: res3 } = mockReqRes({ body: { refreshToken: secondRefresh } });
    await refreshTokenCtrl(r3, res3);
    expect(res3.statusCode).toBe(200);
  });

  it("revokeRefreshToken empêche toute réutilisation ultérieure", async () => {
    const user = await withPassword();
    const { req: loginReq, res: loginRes } = mockReqRes({ body: { identifier: user.email, password: PASSWORD } });
    await login(loginReq, loginRes);
    const token = loginRes.body.refreshToken;

    const { req: revokeReq, res: revokeRes } = mockReqRes({ body: { refreshToken: token } });
    await revokeRefreshToken(revokeReq, revokeRes);
    expect(revokeRes.statusCode).toBe(200);

    const { req, res } = mockReqRes({ body: { refreshToken: token } });
    await refreshTokenCtrl(req, res);
    expect(res.statusCode).toBe(401);
  });
});

describe("sendPhoneOtp / verifyPhoneOtp — SMS désactivé globalement (SMS_ENABLED=false)", () => {
  it("sendPhoneOtp répond 503 smsUnavailable, sans jamais toucher le compte", async () => {
    const user = await withPassword({ phone: "+22500000000", phoneVerified: false });
    const { req, res } = mockReqRes({ user, body: { phone: "+22500000000" } });
    await sendPhoneOtp(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.smsUnavailable).toBe(true);

    const reloaded = await User.findById(user._id);
    expect(reloaded.phoneOtp).toBeFalsy();
  });

  it("verifyPhoneOtp répond 503 smsUnavailable", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({ user, body: { otp: "123456" } });
    await verifyPhoneOtp(req, res);
    expect(res.statusCode).toBe(503);
  });
});
