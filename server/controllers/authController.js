import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import { transporter, FROM_ADDRESS, emailVerificationTemplate, passwordResetTemplate } from "../config/email.js";
import { serverValidateIdentity } from "../utils/idValidation.js";

const JWT_SECRET         = () => process.env.JWT_SECRET;
const REFRESH_SECRET     = () => process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET + "_refresh";
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
      console.log(`\n✅ [DEV] Compte créé et auto-vérifié : ${user.email}`);
      return res.status(201).json({
        user: safeUser(user),
        token: jwtToken,
        emailVerificationSent: false,
        message: "Compte créé et activé automatiquement (mode développement).",
      });
    }

    // Production : envoyer l'email de vérification
    const verifyUrl = `${APP_URL()}/verify-email?token=${token}`;
    transporter.sendMail({
      from:    FROM_ADDRESS,
      to:      user.email,
      subject: "✅ VIT AUTO — Confirmez votre adresse e-mail",
      html:    emailVerificationTemplate(user.firstName, verifyUrl),
    }).catch((err) => console.error("Email send error (non-bloquant):", err.message));

    res.status(201).json({
      user: safeUser(user),
      token: jwtToken,
      emailVerificationSent: true,
      message: "Compte créé ! Vérifiez votre boîte mail pour activer votre compte.",
    });
  } catch (err) {
    console.error("register:", err);
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

    // Bloquer si téléphone fourni mais non vérifié (sauf admin)
    if (user.phone && !user.phoneVerified && user.role !== "admin" && process.env.NODE_ENV === "production") {
      return res.status(403).json({
        code: "PHONE_NOT_VERIFIED",
        message: "Veuillez vérifier votre numéro de téléphone pour vous connecter.",
        phone: user.phone,
        userId: user._id,
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
    console.error("login:", err);
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
    console.error("verifyEmail:", err);
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
    await transporter.sendMail({
      from:    FROM_ADDRESS,
      to:      user.email,
      subject: "✅ VIT AUTO — Nouveau lien de vérification",
      html:    emailVerificationTemplate(user.firstName, verifyUrl),
    });

    res.json({ message: "Nouveau lien envoyé ! Vérifiez votre boîte mail." });
  } catch (err) {
    console.error("resendVerification:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Profil connecté ───────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  res.json({ user: safeUser(req.user) });
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
    await user.save();
    res.json({ message: "Mot de passe modifié avec succès." });
  } catch (err) {
    console.error("changePassword:", err);
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
    console.log(`\n✅ [DEV] Email vérifié manuellement : ${user.email}`);
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
    transporter.sendMail({
      from:    FROM_ADDRESS,
      to:      user.email,
      subject: "🔑 VIT AUTO — Réinitialisation de votre mot de passe",
      html:    passwordResetTemplate(user.firstName, resetUrl),
    }).catch((err) => console.error("Email reset error (non-bloquant):", err.message));

    res.json({ message: "Si ce compte existe, un lien a été envoyé." });
  } catch (err) {
    console.error("forgotPassword:", err);
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
      console.log(`📱 SMS envoyé via Africa's Talking → ${phoneNumber}`);
      return { sent: true, provider: "africastalking", result };
    } catch (err) {
      console.error("Africa's Talking SMS error:", err.message);
    }
  }

  // ── 2. Twilio (fallback international) ───────────────────────────────
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM) {
    try {
      const { default: twilio } = await import("twilio");
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_FROM, to: phoneNumber });
      console.log(`📱 SMS envoyé via Twilio → ${phoneNumber}`);
      return { sent: true, provider: "twilio" };
    } catch (err) {
      console.error("Twilio SMS error:", err.message);
    }
  }

  // ── 3. Fallback console (dev uniquement — jamais en production) ──────
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n📱 [SMS DEV] → ${phoneNumber.slice(0, -4).replace(/./g, "*")}**** : ${otp}\n`);
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
    res.json({
      message:  smsResult.sent
        ? `✅ Code envoyé par SMS au ${target}. Vérifiez vos messages.`
        : isDev
          ? `[DEV] Aucun provider SMS configuré. Code visible dans le terminal serveur.`
          : "Code de vérification envoyé par SMS.",
      provider: smsResult.provider,
      // En dev : retourner le code en clair pour faciliter les tests
      devOtp:   isDev ? otp : undefined,
    });
  } catch (err) {
    console.error("sendPhoneOtp:", err);
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
    console.error("verifyPhoneOtp:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Validation identité (double-check serveur) ────────────────────────────
export const validateIdentity = async (req, res) => {
  const { type, number, expiryDate } = req.body;
  if (!type || !number) {
    return res.status(400).json({ valid: false, message: "Type et numéro de document requis." });
  }

  const result = serverValidateIdentity(type, number, expiryDate || null);

  if (!result.valid) {
    // Log les tentatives suspectes
    if (result.fraud) {
      console.warn(`[SECURITY] Tentative fraude identité — IP: ${req.ip} — type: ${type} — numéro: ${number}`);
    }
    return res.status(422).json(result);
  }

  res.json({ valid: true, country: result.country, message: "Document valide." });
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
    await user.save();

    res.json({ message: "Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.", success: true });
  } catch (err) {
    console.error("resetPassword:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
