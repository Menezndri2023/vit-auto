import express from "express";
import { rateLimit } from "express-rate-limit";
import * as auth from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Limiteur strict pour les actions sensibles OTP / reset (5/h)
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { message: "Trop de tentatives. Réessayez dans 1 heure." },
  standardHeaders: true, legacyHeaders: false,
});

// Limiteur modéré pour la validation de document (60/h — pas un endpoint sensible)
const identityLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 60,
  message: { message: "Trop de vérifications. Réessayez dans 1 heure." },
  standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
});

router.post("/register",             auth.register);
router.post("/login",                auth.login);
router.get("/verify-email/:token",   auth.verifyEmail);
router.post("/resend-verification",  strictLimiter, auth.resendVerification);
router.post("/send-phone-otp",       strictLimiter, auth.sendPhoneOtp);
router.post("/verify-phone-otp",     strictLimiter, auth.verifyPhoneOtp);
router.get("/me",                    authenticate, auth.getMe);
router.post("/forgot-password",      strictLimiter, auth.forgotPassword);
router.post("/reset-password",       strictLimiter, auth.resetPassword);
router.patch("/change-password",     authenticate, auth.changePassword);
router.post("/validate-identity",    identityLimiter, auth.validateIdentity);
router.post("/refresh-token",        auth.refreshToken);
router.post("/revoke-token",         authenticate, auth.revokeRefreshToken);

// ── 2FA — Authentification à deux facteurs ────────────────────────────────
router.post("/2fa/setup",    authenticate, auth.setup2FA);
router.post("/2fa/enable",   authenticate, auth.enable2FA);
router.post("/2fa/verify",   strictLimiter, auth.verify2FA);   // complète le login
router.post("/2fa/disable",  authenticate, auth.disable2FA);

// ⚠️ DEV UNIQUEMENT — bloqué en production
if (process.env.NODE_ENV !== "production") {
  router.get("/dev-verify/:email", authenticate, auth.devVerify);
}

export default router;
