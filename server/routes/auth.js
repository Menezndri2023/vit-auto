import express from "express";
import { rateLimit } from "express-rate-limit";
import * as auth from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  oauthGoogleSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  twoFAEnableSchema,
  twoFADisableSchema,
} from "../validators/auth.validators.js";

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

router.post("/register",             validate(registerSchema), auth.register);
router.post("/login",                validate(loginSchema), auth.login);
router.post("/oauth/google",         validate(oauthGoogleSchema), auth.oauthGoogle);
router.get("/verify-email/:token",   auth.verifyEmail);
router.post("/verify-email-code",    strictLimiter, authenticate, auth.verifyEmailCode);
router.post("/resend-email-code",    strictLimiter, authenticate, auth.resendEmailCode);
router.get("/confirm-email-change/:token", auth.confirmEmailChange);
router.post("/resend-verification",  strictLimiter, auth.resendVerification);
router.post("/send-phone-otp",       strictLimiter, authenticate, auth.sendPhoneOtp);
router.post("/verify-phone-otp",     strictLimiter, authenticate, auth.verifyPhoneOtp);
router.get("/me",                    authenticate, auth.getMe);
router.post("/forgot-password",      strictLimiter, validate(forgotPasswordSchema), auth.forgotPassword);
router.post("/reset-password",       strictLimiter, validate(resetPasswordSchema), auth.resetPassword);
router.patch("/change-password",     authenticate, validate(changePasswordSchema), auth.changePassword);
router.post("/validate-identity",    identityLimiter, auth.validateIdentity);
router.post("/refresh-token",        auth.refreshToken);
router.post("/revoke-token",         authenticate, auth.revokeRefreshToken);
router.post("/logout-others",        authenticate, auth.logoutOtherSessions);

// ── 2FA — Authentification à deux facteurs ────────────────────────────────
// NB: /2fa/verify n'est PAS branché sur twoFAVerifySchema — ce schéma impose
// `token` à exactement 6 caractères, or verify2FA accepte aussi les codes de
// secours à 8 caractères hexadécimaux (voir authController.js) : le brancher
// bloquerait la connexion via code de secours avant même d'atteindre le contrôleur.
router.post("/2fa/setup",    authenticate, auth.setup2FA);
router.post("/2fa/enable",   authenticate, validate(twoFAEnableSchema), auth.enable2FA);
router.post("/2fa/verify",   strictLimiter, auth.verify2FA);   // complète le login
router.post("/2fa/disable",  authenticate, validate(twoFADisableSchema), auth.disable2FA);

// ⚠️ DEV UNIQUEMENT — bloqué en production
if (process.env.NODE_ENV !== "production") {
  router.get("/dev-verify/:email", authenticate, auth.devVerify);
}

export default router;
