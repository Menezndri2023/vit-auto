import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { register, verifyEmail } from "../controllers/authController.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Sans SMTP "configuré" (SMTP_HOST/USER/PASS), authController bascule en
// auto-vérification dev (isDevNoSmtp()) et court-circuite tout le flux email —
// on force ces variables pour exercer le vrai chemin (token + email + notification),
// celui réellement utilisé en production.
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

describe("authController — notifications inscription/vérification email", () => {
  it("crée le compte avec un token de vérification et une notification in-app invitant à vérifier l'email", async () => {
    const body = validBody();
    const { req, res } = mockReqRes({ body });
    await register(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.emailVerificationSent).toBe(true);

    const user = await User.findOne({ email: body.email });
    expect(user).toBeTruthy();
    expect(user.emailVerified).toBe(false);
    expect(user.emailVerificationToken).toBeTruthy();

    const notif = await Notification.findOne({ user: user._id, type: "system" });
    expect(notif).toBeTruthy();
    expect(notif.titre).toMatch(/Vérifiez votre adresse email/);
  });

  it("verifyEmail active le compte et crée une notification de confirmation, jamais en double sur un second clic", async () => {
    const body = validBody();
    const { req, res } = mockReqRes({ body });
    await register(req, res);
    const user = await User.findOne({ email: body.email });

    const first = mockReqRes({ params: { token: user.emailVerificationToken } });
    await verifyEmail(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(400);

    const verifiedUser = await User.findById(user._id);
    expect(verifiedUser.emailVerified).toBe(true);

    const count1 = await Notification.countDocuments({ user: user._id, type: "success" });
    expect(count1).toBe(1);

    // Second clic sur le même lien (comportement idempotent documenté —
    // certains clients mail préchargent le lien avant le clic réel) : pas de doublon.
    const second = mockReqRes({ params: { token: user.emailVerificationToken } });
    await verifyEmail(second.req, second.res);
    expect(second.res.status).not.toHaveBeenCalledWith(400);

    const count2 = await Notification.countDocuments({ user: user._id, type: "success" });
    expect(count2).toBe(1);
  });

  it("verifyEmail rejette un token invalide sans créer de notification", async () => {
    const { req, res } = mockReqRes({ params: { token: "token-inexistant" } });
    await verifyEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
