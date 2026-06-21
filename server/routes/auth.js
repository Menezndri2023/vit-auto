import express from "express";
import * as auth from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/register",             auth.register);               // inscription
router.post("/login",                auth.login);                  // connexion
router.get("/verify-email/:token",   auth.verifyEmail);            // confirmation e-mail
router.post("/resend-verification",  auth.resendVerification);     // renvoyer lien email
router.post("/send-phone-otp",       auth.sendPhoneOtp);           // envoyer OTP téléphone
router.post("/verify-phone-otp",     auth.verifyPhoneOtp);         // vérifier OTP téléphone
router.get("/me",         authenticate, auth.getMe);               // profil connecté
router.post("/forgot-password",      auth.forgotPassword);         // demande réinitialisation mdp
router.post("/reset-password",       auth.resetPassword);          // nouveau mot de passe (lien email)
router.patch("/change-password",     authenticate, auth.changePassword); // changement mot de passe (connecté)

// ⚠️ DEV UNIQUEMENT — vérifier un compte sans email
router.get("/dev-verify/:email",     auth.devVerify);

export default router;
