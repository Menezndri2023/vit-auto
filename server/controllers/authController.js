import logger from "../utils/logger.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import User from "../models/User.js";
import { serverValidateIdentity } from "../utils/idValidation.js";
import { dispatch } from "../queue/index.js";

const JWT_SECRET         = () => process.env.JWT_SECRET;
// REFRESH_TOKEN_SECRET est obligatoire et vérifié au démarrage (server.js) — jamais
// dérivé de JWT_SECRET (une fuite partielle de JWT_SECRET permettrait sinon de
// forger des refresh tokens valides).
const REFRESH_SECRET     = () => process.env.REFRESH_TOKEN_SECRET;
const APP_URL            = () => process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
const VERIFY_TTL         = 24 * 60 * 60 * 1000; // 24h
const REFRESH_TTL_DAYS   = 30;

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function signJWT(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET(),
    { expiresIn: "7d" }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id },
    REFRESH_SECRET(),
    { expiresIn: `${REFRESH_TTL_DAYS}d` }
  );
}

function safeUser(u) {
  return {
    id:               u._id,
    firstName:        u.firstName,
    lastName:         u.lastName,
    email:            u.email,
    phone:            u.phone,
    role:             u.role,
    emailVerified:    u.emailVerified,
    phoneVerified:    u.phoneVerified,
    identityStatus:   u.identity?.status || "not_submitted",
    documentsVerified: u.documentsVerified,
    profilePhoto:     u.profilePhoto,
    kycStatus:        u.kycStatus        || "EN_ATTENTE",
    kycScore:         u.kycScore         ?? 0,
    kycBadge:         u.kycBadge         || "INSUFFISANT",
    createdAt:        u.createdAt,
    lastLogin:        u.lastLogin,
    importerProfile:  u.importerProfile  || null,
  };
}

// true quand on est en dev ET que le SMTP n'est pas configuré
const smtpConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const isDevNoSmtp = () =>
  process.env.NODE_ENV !== "production" && !smtpConfigured();

// true si un provider SMS réel (Africa's Talking ou Twilio) est configuré. Exiger la
// vérification du téléphone n'a de sens QUE si un code peut réellement être envoyé —
// sinon un utilisateur qui a renseigné (ou skip) son numéro reste bloqué à vie, sans
// aucun moyen de recevoir le code (voir sendSmsOtp : "sent:false" en prod = piège).
const smsConfigured = () =>
  !!(process.env.AT_USERNAME && process.env.AT_API_KEY &&
     process.env.AT_API_KEY !== "atsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") ||
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM);

// ── Sanitisation basique (strip HTML, trim) ───────────────────────────────
const sanitize = (v) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim() : v);

// ── Inscription ───────────────────────────────────────────────────────────
export const register = async (req, res) => {
  const firstName = sanitize(req.body.firstName);
  const lastName  = sanitize(req.body.lastName);
  const email     = sanitize(req.body.email)?.toLowerCase();
  const password  = req.body.password; // Ne pas modifier le mot de passe
  const phone     = sanitize(req.body.phone);
  const role      = sanitize(req.body.role);

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ message: "Données manquantes." });
  }
  if (firstName.length < 2 || firstName.length > 50) {
    return res.status(400).json({ message: "Le prénom doit contenir entre 2 et 50 caractères." });
  }
  if (lastName.length < 2 || lastName.length > 50) {
    return res.status(400).json({ message: "Le nom doit contenir entre 2 et 50 caractères." });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères." });
  }
  if (password.length > 128) {
    return res.status(400).json({ message: "Mot de passe trop long." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Format d'e-mail invalide." });
  }
  if (email.length > 254) {
    return res.status(400).json({ message: "Adresse e-mail trop longue." });
  }
  if (phone && !/^[+\d\s\-().]{6,20}$/.test(phone)) {
    return res.status(400).json({ message: "Format de téléphone invalide." });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      // En dev sans SMTP : si le compte existe mais n'est pas vérifié, on le vérifie automatiquement
      if (isDevNoSmtp() && !existing.emailVerified) {
        existing.emailVerified = true;
        existing.emailVerificationToken   = null;
        existing.emailVerificationExpires = null;
        await existing.save();
        const jwtToken = signJWT(existing);
        return res.status(200).json({
          user: safeUser(existing),
          token: jwtToken,
          emailVerificationSent: false,
          message: "[DEV] Compte existant auto-vérifié. Vous pouvez vous connecter.",
        });
      }
      return res.status(409).json({ message: "Adresse e-mail déjà utilisée." });
    }

    const allowedRoles = ["client", "partenaire"];
    const userRole = allowedRoles.includes(role) ? role : "client";

    const hash  = await bcrypt.hash(password, 12);
    const token = makeToken();

    // En développement sans SMTP : auto-vérifier l'email
    const autoVerify = isDevNoSmtp();

    const user = await User.create({
      firstName, lastName,
      email,
      password: hash,
      phone: phone || null,
      role: userRole,
      emailVerificationToken:   autoVerify ? null  : token,
      emailVerificationExpires: autoVerify ? null  : new Date(Date.now() + VERIFY_TTL),
      emailVerified:            autoVerify,
    });

    const jwtToken = signJWT(user);

    if (autoVerify) {
      logger.info("[DEV] Compte auto-vérifié", { email: user.email });
      return res.status(201).json({
        user: safeUser(user),
        token: jwtToken,
        emailVerificationSent: false,
        message: "Compte créé et activé automatiquement (mode développement).",
      });
    }

    // Production : envoyer l'email de vérification via queue
    const verifyUrl = `${APP_URL()}/verify-email?token=${token}`;
    dispatch.emailVerification(user.email, user._id.toString(), verifyUrl).catch(() => {});

    res.status(201).json({
      user: safeUser(user),
      token: jwtToken,
      emailVerificationSent: true,
      message: "Compte créé ! Vérifiez votre boîte mail pour activer votre compte.",
    });
  } catch (err) {
    logger.error("register:", err);
    res.status(500).json({ message: "Erreur serveur lors de l'inscription." });
  }
};

// ── Connexion ─────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  const email    = sanitize(req.body.email)?.toLowerCase();
  const password = req.body.password;
  if (!email || !password) return res.status(400).json({ message: "Données manquantes." });
  if (password.length > 128) return res.status(400).json({ message: "Mot de passe trop long." });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Identifiants invalides." });

    if (!user.isActive) {
      return res.status(403).json({ message: "Compte bloqué. Contactez le support VIT AUTO." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: "Identifiants invalides." });

    // Bloquer si email non vérifié (sauf admin et mode dev sans SMTP)
    if (!user.emailVerified && user.role !== "admin" && !isDevNoSmtp()) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Veuillez vérifier votre adresse e-mail avant de vous connecter. Vérifiez votre boîte mail ou demandez un nouveau lien.",
        email: user.email,
      });
    }
    // En dev sans SMTP : auto-vérifier à la première connexion si pas encore fait
    if (!user.emailVerified && isDevNoSmtp()) {
      user.emailVerified = true;
      user.emailVerificationToken   = null;
      user.emailVerificationExpires = null;
    }

    // Bloquer si téléphone fourni mais non vérifié (sauf admin) — uniquement si un
    // provider SMS est réellement configuré (sinon personne ne pourrait jamais se
    // débloquer, faute de pouvoir recevoir le code : voir smsConfigured() ci-dessus).
    if (user.phone && !user.phoneVerified && user.role !== "admin" && smsConfigured()) {
      return res.status(403).json({
        code: "PHONE_NOT_VERIFIED",
        message: "Veuillez vérifier votre numéro de téléphone pour vous connecter.",
        phone: user.phone,
        userId: user._id,
      });
    }

    // 2FA — si activé, retourner un challenge au lieu des tokens
    if (user.twoFactor?.enabled) {
      return res.json({
        requiresTwoFactor: true,
        userId: user._id,
        message: "Code d'authentification requis.",
      });
    }

    // Mettre à jour lastLogin
    user.lastLogin = new Date();

    // Générer refresh token et l'enregistrer (max 5 devices)
    const refreshToken = signRefreshToken(user);
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
    await user.save();

    const token = signJWT(user);

    res.json({
      user: safeUser(user),
      token,
      refreshToken,
    });
  } catch (err) {
    logger.error("login:", err);
    res.status(500).json({ message: "Erreur serveur lors de la connexion." });
  }
};

// ── Vérifier l'e-mail via token ───────────────────────────────────────────
export const verifyEmail = async (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ message: "Token manquant." });

  try {
    const user = await User.findOne({
      emailVerificationToken:   token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Lien de vérification invalide ou expiré. Demandez un nouveau lien.",
      });
    }

    user.emailVerified            = true;
    user.emailVerificationToken   = null;
    user.emailVerificationExpires = null;
    await user.save();

    res.json({ message: "E-mail vérifié avec succès ! Vous pouvez vous connecter.", success: true });
  } catch (err) {
    logger.error("verifyEmail:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Renvoyer l'e-mail de vérification ────────────────────────────────────
export const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "E-mail requis." });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "Compte introuvable." });
    if (user.emailVerified) return res.json({ message: "E-mail déjà vérifié." });

    const token = makeToken();
    user.emailVerificationToken   = token;
    user.emailVerificationExpires = new Date(Date.now() + VERIFY_TTL);
    await user.save();

    const verifyUrl = `${APP_URL()}/verify-email?token=${token}`;
    await dispatch.emailVerification(user.email, user._id.toString(), verifyUrl).catch(() => {});

    res.json({ message: "Nouveau lien envoyé ! Vérifiez votre boîte mail." });
  } catch (err) {
    logger.error("resendVerification:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Profil connecté ───────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    res.json({ user: safeUser(req.user) });
  } catch (err) {
    logger.error("getMe:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Changer le mot de passe (connecté) ───────────────────────────────────
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Mot de passe actuel et nouveau requis." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Le nouveau mot de passe doit contenir au moins 8 caractères." });
  }
  try {
    const user = await User.findById(req.user._id);
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return res.status(401).json({ message: "Mot de passe actuel incorrect." });

    user.password = await bcrypt.hash(newPassword, 12);
    user.refreshTokens = [];
    await user.save();
    res.json({ message: "Mot de passe modifié avec succès." });
  } catch (err) {
    logger.error("changePassword:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── DEV UNIQUEMENT : vérifier un compte sans email ───────────────────────
export const devVerify = async (req, res) => {
  // Bloqué en production ET si SMTP est configuré (environnement "vrai")
  const isDevOnly = process.env.NODE_ENV !== "production" &&
    !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!isDevOnly) {
    return res.status(404).json({ message: "Route non disponible." });
  }
  const { email } = req.params;
  try {
    const user = await User.findOneAndUpdate(
      { email: decodeURIComponent(email).toLowerCase() },
      { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    const token = signJWT(user);
    logger.info("[DEV] Email vérifié manuellement", { email: user.email });
    res.json({ message: `Email vérifié pour ${user.email}. Vous pouvez vous connecter.`, token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mot de passe oublié ───────────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "E-mail requis." });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    // Toujours répondre OK pour ne pas révéler l'existence d'un compte
    if (!user) return res.json({ message: "Si ce compte existe, un lien a été envoyé." });

    const token = makeToken();
    user.passwordResetToken   = token;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await user.save();

    const resetUrl = `${APP_URL()}/reset-password?token=${token}`;
    dispatch.passwordReset(user.email, user._id.toString(), resetUrl, user.firstName).catch(() => {});

    res.json({ message: "Si ce compte existe, un lien a été envoyé." });
  } catch (err) {
    logger.error("forgotPassword:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Envoi SMS — fonction commune (Africa's Talking → Twilio → console) ───
async function sendSmsOtp(phoneNumber, otp) {
  const message = `VIT AUTO — Votre code de vérification : ${otp}. Valable 10 minutes. Ne le partagez jamais.`;

  // ── 1. Africa's Talking (priorité — Afrique de l'Ouest) ──────────────
  if (process.env.AT_USERNAME && process.env.AT_API_KEY &&
      process.env.AT_API_KEY !== "atsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") {
    try {
      const AfricasTalking = (await import("africastalking")).default;
      const at = AfricasTalking({ username: process.env.AT_USERNAME, apiKey: process.env.AT_API_KEY });
      const result = await at.SMS.send({
        to:      [phoneNumber],
        message,
        from:    process.env.AT_SENDER_ID || "VIT-AUTO",
      });
      logger.info("SMS envoyé via Africa's Talking", { phoneNumber });
      return { sent: true, provider: "africastalking", result };
    } catch (err) {
      logger.error("Africa's Talking SMS error:", err.message);
    }
  }

  // ── 2. Twilio (fallback international) ───────────────────────────────
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM) {
    try {
      const { default: twilio } = await import("twilio");
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_FROM, to: phoneNumber });
      logger.info("SMS envoyé via Twilio", { phoneNumber });
      return { sent: true, provider: "twilio" };
    } catch (err) {
      logger.error("Twilio SMS error:", err.message);
    }
  }

  // ── 3. Fallback console (dev uniquement — jamais en production) ──────
  if (process.env.NODE_ENV !== "production") {
    logger.info(`[SMS DEV] code OTP simulé`, { maskedPhone: phoneNumber.slice(0, -4).replace(/./g, "*") + "****" });
  }
  return { sent: false, provider: "console" };
}

// ── Envoyer OTP téléphone ─────────────────────────────────────────────────
export const sendPhoneOtp = async (req, res) => {
  const { phone, userId } = req.body;
  const target = phone?.trim();
  if (!target) return res.status(400).json({ message: "Numéro de téléphone requis." });

  try {
    const filter = userId ? { _id: userId } : { phone: target };
    const user = await User.findOne(filter);
    if (!user) return res.status(404).json({ message: "Compte introuvable pour ce numéro." });
    if (user.phoneVerified && user.phone === target) {
      return res.json({ message: "Téléphone déjà vérifié.", alreadyVerified: true });
    }

    // Générer OTP à 6 chiffres et le stocker hashé
    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    user.phoneOtp        = otpHash;
    user.phoneOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    if (target) user.phone = target;
    user.phoneVerified = false;
    await user.save();

    // Envoyer le vrai SMS
    const smsResult = await sendSmsOtp(target, otp);

    const isDev = process.env.NODE_ENV !== "production";

    // Ne JAMAIS répondre "code envoyé" si ce n'est pas vrai — l'utilisateur resterait
    // sinon bloqué à attendre indéfiniment un SMS qui n'arrivera jamais, sans recours.
    if (!smsResult.sent && !isDev) {
      logger.error("sendPhoneOtp: aucun provider SMS fonctionnel en production", { phone: target });
      return res.status(503).json({
        message: "Le service d'envoi de SMS est momentanément indisponible. Contactez le support VIT AUTO (contact@vit-auto.com) pour vérifier votre compte.",
        smsUnavailable: true,
      });
    }

    res.json({
      message:  smsResult.sent
        ? `✅ Code envoyé par SMS au ${target}. Vérifiez vos messages.`
        : `[DEV] Aucun provider SMS configuré. Code visible dans le terminal serveur.`,
      provider: smsResult.provider,
      // En dev : retourner le code en clair pour faciliter les tests
      devOtp:   isDev ? otp : undefined,
    });
  } catch (err) {
    logger.error("sendPhoneOtp:", err);
    res.status(500).json({ message: "Erreur lors de l'envoi du SMS." });
  }
};

// ── Vérifier OTP téléphone ────────────────────────────────────────────────
export const verifyPhoneOtp = async (req, res) => {
  const { phone, userId, otp } = req.body;
  if (!otp) return res.status(400).json({ message: "Code OTP requis." });

  try {
    const filter = userId ? { _id: userId } : { phone: phone?.trim() };
    const user = await User.findOne(filter);
    if (!user) return res.status(404).json({ message: "Compte introuvable." });
    if (user.phoneVerified) return res.json({ message: "Téléphone déjà vérifié.", success: true });

    const otpValid = user.phoneOtp && await bcrypt.compare(otp, user.phoneOtp);
    if (!otpValid) {
      return res.status(400).json({ message: "Code OTP incorrect." });
    }
    if (!user.phoneOtpExpires || user.phoneOtpExpires < new Date()) {
      return res.status(400).json({ message: "Code OTP expiré. Demandez un nouveau code." });
    }

    user.phoneVerified   = true;
    user.phoneOtp        = null;
    user.phoneOtpExpires = null;
    await user.save();

    const token = signJWT(user);
    res.json({ message: "Téléphone vérifié avec succès !", success: true, user: safeUser(user), token });
  } catch (err) {
    logger.error("verifyPhoneOtp:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Validation identité (double-check serveur) ────────────────────────────
export const validateIdentity = async (req, res) => {
  try {
    const { type, number, expiryDate } = req.body;
    if (!type || !number) {
      return res.status(400).json({ valid: false, message: "Type et numéro de document requis." });
    }

    const result = serverValidateIdentity(type, number, expiryDate || null);

    if (!result.valid) {
      // Log les tentatives suspectes
      if (result.fraud) {
        logger.warn("[SECURITY] Tentative fraude identité", { ip: req.ip, type, number });
      }
      return res.status(422).json(result);
    }

    res.json({ valid: true, country: result.country, message: "Document valide." });
  } catch (err) {
    logger.error("validateIdentity:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Refresh Token ─────────────────────────────────────────────────────────
export const refreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) return res.status(401).json({ message: "Refresh token manquant." });

  try {
    const decoded = jwt.verify(token, REFRESH_SECRET());
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Utilisateur invalide." });
    }
    if (!user.refreshTokens || !user.refreshTokens.includes(token)) {
      return res.status(401).json({ message: "Refresh token révoqué ou invalide." });
    }

    // Rotation : remplacer l'ancien refresh token par un nouveau
    const newRefreshToken = signRefreshToken(user);
    user.refreshTokens = user.refreshTokens
      .filter((t) => t !== token)
      .concat(newRefreshToken)
      .slice(-5);  // max 5 devices
    await user.save();

    const newAccessToken = signJWT(user);
    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Refresh token expiré. Reconnectez-vous." });
    }
    return res.status(401).json({ message: "Refresh token invalide." });
  }
};

// ── Révoquer refresh token (déconnexion) ─────────────────────────────────
export const revokeRefreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) return res.status(400).json({ message: "Token requis." });

  try {
    const decoded = jwt.verify(token, REFRESH_SECRET());
    await User.findByIdAndUpdate(decoded.id, {
      $pull: { refreshTokens: token },
    });
    res.json({ message: "Token révoqué avec succès." });
  } catch {
    res.json({ message: "Token révoqué (ou déjà invalide)." });
  }
};

// ── Réinitialisation du mot de passe ──────────────────────────────────────
export const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ message: "Token et nouveau mot de passe requis." });
  if (password.length < 8) return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères." });

  try {
    const user = await User.findOne({
      passwordResetToken:   token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Lien invalide ou expiré. Recommencez la procédure." });
    }

    user.password             = await bcrypt.hash(password, 12);
    user.passwordResetToken   = null;
    user.passwordResetExpires = null;
    user.refreshTokens        = [];
    await user.save();

    res.json({ message: "Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.", success: true });
  } catch (err) {
    logger.error("resetPassword:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// 2FA — Authentification à deux facteurs (TOTP — Google Authenticator)
// ══════════════════════════════════════════════════════════════════════════════

function buildTotp(secret, email) {
  return new OTPAuth.TOTP({
    issuer:    "VIT AUTO",
    label:     email,
    algorithm: "SHA1",
    digits:    6,
    period:    30,
    secret:    OTPAuth.Secret.fromBase32(secret),
  });
}

// POST /api/auth/2fa/setup — Génère secret + QR code (sans activer)
export const setup2FA = async (req, res) => {
  try {
    const user = req.user;
    if (user.twoFactor?.enabled) {
      return res.status(400).json({ message: "2FA déjà activé." });
    }

    // Générer un nouveau secret
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const totp   = buildTotp(secret, user.email);
    const qrUrl  = await QRCode.toDataURL(totp.toString());

    // Stocker temporairement (non encore activé)
    user.twoFactor = { ...user.twoFactor, secret, enabled: false };
    await user.save();

    res.json({
      secret,
      qrCode:  qrUrl,
      message: "Scannez le QR code avec Google Authenticator puis activez le 2FA.",
    });
  } catch (err) {
    logger.error("setup2FA:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/auth/2fa/enable — Active le 2FA après vérification du premier code
export const enable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    const user = req.user;

    if (!user.twoFactor?.secret) {
      return res.status(400).json({ message: "Lancez d'abord /2fa/setup." });
    }
    if (user.twoFactor.enabled) {
      return res.status(400).json({ message: "2FA déjà activé." });
    }

    const totp  = buildTotp(user.twoFactor.secret, user.email);
    const delta = totp.validate({ token, window: 1 });
    if (delta === null) {
      return res.status(400).json({ message: "Code invalide. Réessayez." });
    }

    // Générer 10 codes de secours (hashés)
    const rawCodes     = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString("hex").toUpperCase());
    const hashedCodes  = await Promise.all(rawCodes.map((c) => bcrypt.hash(c, 10)));

    user.twoFactor.enabled    = true;
    user.twoFactor.enabledAt  = new Date();
    user.twoFactor.backupCodes = hashedCodes.map((h) => ({ code: h, used: false }));
    await user.save();

    res.json({
      message:     "2FA activé avec succès.",
      backupCodes: rawCodes,  // affichés UNE SEULE fois
    });
  } catch (err) {
    logger.error("enable2FA:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/auth/2fa/verify — Complète la connexion après challenge 2FA
export const verify2FA = async (req, res) => {
  try {
    const { userId, token } = req.body;
    if (!userId || !token) return res.status(400).json({ message: "userId et token requis." });

    const user = await User.findById(userId);
    if (!user || !user.isActive) return res.status(401).json({ message: "Utilisateur introuvable." });
    if (!user.twoFactor?.enabled) return res.status(400).json({ message: "2FA non activé." });

    const totp  = buildTotp(user.twoFactor.secret, user.email);
    const delta = totp.validate({ token, window: 1 });

    // Tenter les codes de secours si TOTP échoue — Array.prototype.findIndex n'attend
    // jamais un prédicat async (il retourne toujours une Promise, donc toujours "truthy"),
    // ce qui validait N'IMPORTE QUEL code : boucle explicite avec await à la place.
    if (delta === null) {
      const backupCodes = user.twoFactor.backupCodes || [];
      let codeIdx = -1;
      for (let i = 0; i < backupCodes.length; i++) {
        if (!backupCodes[i].used && await bcrypt.compare(token, backupCodes[i].code)) {
          codeIdx = i;
          break;
        }
      }
      if (codeIdx < 0) {
        return res.status(401).json({ message: "Code invalide." });
      }
      user.twoFactor.backupCodes[codeIdx].used = true;
    }

    user.lastLogin = new Date();
    const refreshToken = signRefreshToken(user);
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
    await user.save();

    res.json({
      user: safeUser(user),
      token: signJWT(user),
      refreshToken,
    });
  } catch (err) {
    logger.error("verify2FA:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/auth/2fa/disable — Désactive le 2FA (mot de passe requis)
export const disable2FA = async (req, res) => {
  try {
    const { password } = req.body;
    const user = req.user;

    if (!user.twoFactor?.enabled) {
      return res.status(400).json({ message: "2FA non activé." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: "Mot de passe incorrect." });

    user.twoFactor = { enabled: false, secret: null, backupCodes: [], enabledAt: null };
    await user.save();

    res.json({ message: "2FA désactivé." });
  } catch (err) {
    logger.error("disable2FA:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
