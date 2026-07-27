import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { register, verifyEmailCode, resendEmailCode } from "../controllers/authController.js";
import User from "../models/User.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Sans SMTP "configuré", authController bascule en auto-vérification dev
// (isDevNoSmtp()) et court-circuite tout le flux — voir authNotifications.test.js,
// même repli, pour exercer le vrai chemin code+bloquant utilisé en production.
let originalEnv;
beforeEach(() => {
  originalEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_USER = "test@test.local";
  process.env.SMTP_PASS = "test-password";
});
afterEach(() => {
  process.env.SMTP_HOST = originalEnv.SMTP_HOST || "";
  process.env.SMTP_USER = originalEnv.SMTP_USER || "";
  process.env.SMTP_PASS = originalEnv.SMTP_PASS || "";
});

const validBody = (overrides = {}) => ({
  firstName: "Jean", lastName: "Testeur",
  email: `jean.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`,
  password: "password123", birthDate: "1990-01-01",
  ...overrides,
});

describe("register — code de confirmation email obligatoire", () => {
  it("génère un code à 6 chiffres (hashé) et le signale au front via emailVerificationCodeRequired", async () => {
    const body = validBody();
    const { req, res } = mockReqRes({ body });
    await register(req, res);

    expect(res.body.emailVerificationCodeRequired).toBe(true);

    const user = await User.findOne({ email: body.email });
    expect(user.emailVerified).toBe(false);
    expect(user.emailVerificationCode).toBeTruthy();
    expect(user.emailVerificationCode).not.toMatch(/^\d{6}$/); // hashé, jamais en clair
    expect(user.emailVerificationCodeExpires.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("verifyEmailCode", () => {
  const registerAndGetUser = async (overrides = {}) => {
    const body = validBody(overrides);
    const { req, res } = mockReqRes({ body });
    await register(req, res);
    return User.findOne({ email: body.email });
  };

  it("400 si le code est manquant", async () => {
    const user = await registerAndGetUser();
    const { req, res } = mockReqRes({ user });
    await verifyEmailCode(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400 pour un code incorrect, sans jamais vérifier le compte", async () => {
    const user = await registerAndGetUser();
    const { req, res } = mockReqRes({ user, body: { code: "000000" } });
    await verifyEmailCode(req, res);
    expect(res.statusCode).toBe(400);

    const reloaded = await User.findById(user._id);
    expect(reloaded.emailVerified).toBe(false);
  });

  it("400 pour un code expiré", async () => {
    const user = await registerAndGetUser();
    await User.updateOne({ _id: user._id }, { $set: { emailVerificationCodeExpires: new Date(Date.now() - 1000) } });
    const expiredUser = await User.findById(user._id);
    // Le code en clair n'est jamais stocké : on ne peut pas le "deviner" ici,
    // mais l'expiration doit être vérifiée AVANT la comparaison bcrypt —
    // n'importe quel code (même faux) doit donc renvoyer 400 "expiré", pas
    // "incorrect", pour guider correctement l'utilisateur vers "Renvoyer le code".
    const { req, res } = mockReqRes({ user: expiredUser, body: { code: "123456" } });
    await verifyEmailCode(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/expiré/i);
  });

  it("active le compte avec le bon code et délivre un nouveau JWT", async () => {
    const body = validBody();
    const { req: regReq, res: regRes } = mockReqRes({ body });
    await register(regReq, regRes);
    const user = await User.findOne({ email: body.email });

    // Le code en clair n'est jamais renvoyé par register() en prod — on le
    // récupère ici via un accès direct au module pour simuler la réception
    // de l'email, en recréant le même hash que celui stocké n'est pas
    // possible (bcrypt à sens unique) : on régénère donc via resendEmailCode,
    // qui répond toujours 200 et écrase le code avec un nouveau, connu
        // seulement par l'email réellement envoyé (mocké en dispatch ci-dessous).
    const { dispatch } = await import("../queue/index.js");
    let capturedCode = null;
    const original = dispatch.emailVerification;
    dispatch.emailVerification = async (to, userId, verifyUrl, firstName, code) => { capturedCode = code; };
    try {
      const { req: resendReq, res: resendRes } = mockReqRes({ user });
      await resendEmailCode(resendReq, resendRes);
      expect(resendRes.statusCode).toBe(200);
      expect(capturedCode).toMatch(/^\d{6}$/);

      const { req, res } = mockReqRes({ user, body: { code: capturedCode } });
      await verifyEmailCode(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeTruthy();

      const reloaded = await User.findById(user._id);
      expect(reloaded.emailVerified).toBe(true);
      expect(reloaded.emailVerificationCode).toBeNull();
    } finally {
      dispatch.emailVerification = original;
    }
  });

  it("répond succès immédiatement si l'email est déjà vérifié (idempotent)", async () => {
    const user = await registerAndGetUser({ });
    await User.updateOne({ _id: user._id }, { $set: { emailVerified: true } });
    const reloaded = await User.findById(user._id);
    const { req, res } = mockReqRes({ user: reloaded, body: { code: "999999" } });
    await verifyEmailCode(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("resendEmailCode", () => {
  it("régénère un code différent à chaque appel", async () => {
    const body = validBody();
    const { req, res } = mockReqRes({ body });
    await register(req, res);
    const user = await User.findOne({ email: body.email });
    const firstHash = user.emailVerificationCode;

    const { req: r, res: rr } = mockReqRes({ user });
    await resendEmailCode(r, rr);
    expect(rr.statusCode).toBe(200);

    const reloaded = await User.findById(user._id);
    expect(reloaded.emailVerificationCode).toBeTruthy();
    expect(reloaded.emailVerificationCode).not.toBe(firstHash);
  });

  it("n'envoie rien si l'email est déjà vérifié", async () => {
    const body = validBody();
    const { req, res } = mockReqRes({ body });
    await register(req, res);
    const user = await User.findOne({ email: body.email });
    await User.updateOne({ _id: user._id }, { $set: { emailVerified: true } });
    const reloaded = await User.findById(user._id);

    const { req: r, res: rr } = mockReqRes({ user: reloaded });
    await resendEmailCode(r, rr);
    expect(rr.statusCode).toBe(200);
    expect(rr.body.alreadyVerified).toBe(true);
  });
});
