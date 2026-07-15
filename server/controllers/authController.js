import logger from "../utils/logger.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import User from "../models/User.js";
import { serverValidateIdentity } from "../utils/idValidation.js";
import { smsConfigured, twilioVerifyConfigured } from "../utils/smsConfigured.js";
import { emailVerificationRequired } from "../utils/emailVerificationRequired.js";
import { dispatch } from "../queue/index.js";
import { sendVerification, checkVerification } from "../services/twilioVerify.js";
import { isValidCountryCode } from "../utils/countries.js";

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
    { id: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 0 },
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

// Les refresh tokens ne sont jamais stockés en clair en base (compromission DB
// = vol direct de sessions actives sinon) : on ne persiste que leur hash SHA-256.
// Le token étant déjà un secret haute-entropie (JWT signé), un hash simple suffit
// (pas besoin de bcrypt/salt comme pour un mot de passe humain).
function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeUser(u) {
  return {
    id:               u._id,
    firstName:        u.firstName,
    lastName:         u.lastName,
    email:            u.email,
    phone:            u.phone,
    country:          u.country || null,
    role:             u.role,
    sellerType:       u.sellerType || null,
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
// L'e-mail est l'unique canal d'inscription et de vérification (voir
// smsConfigured.js — la vérification SMS est désactivée). Le téléphone reste un
// champ de profil facultatif (utile pour les réservations, KYC, etc.) mais n'est
// ni un identifiant de connexion ni un canal de vérification.
export const register = async (req, res) => {
  const firstName = sanitize(req.body.firstName);
  const lastName  = sanitize(req.body.lastName);
  const password  = req.body.password; // Ne pas modifier le mot de passe
  const role      = sanitize(req.body.role);

  const email   = sanitize(req.body.email)?.toLowerCase() || null;
  const phone   = sanitize(req.body.phone) || null;
  const country = sanitize(req.body.country)?.toUpperCase() || null;
  // Précisé uniquement pour role="partenaire" (voir Register.jsx) — détermine le
  // niveau de vérification exigé pour publier une annonce (particulier : KYC
  // identité seul ; professionnel/entreprise : certification complète —
  // voir vehicleController.js/driverController.js createVehicle/createDriver).
  const SELLER_TYPES = ["particulier", "professionnel", "entreprise"];
  const sellerTypeIn = sanitize(req.body.sellerType);
  const sellerType   = SELLER_TYPES.includes(sellerTypeIn) ? sellerTypeIn : null;

  if (!password || !firstName || !lastName) {
    return res.status(400).json({ message: "Données manquantes." });
  }
  if (country && !isValidCountryCode(country)) {
    return res.status(400).json({ message: "Pays invalide." });
  }
  if (!email) {
    return res.status(400).json({ message: "Une adresse e-mail est requise pour créer un compte." });
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
    const existing = await User.findOne({ email });
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
    const hash = await bcrypt.hash(password, 12);

    const token = makeToken();
    const autoVerify = isDevNoSmtp(); // En développement sans SMTP : auto-vérifier l'email

    const user = await User.create({
      firstName, lastName,
      email,
      phone,
      country,
      password: hash,
      role: userRole,
      sellerType: userRole === "partenaire" ? sellerType : null,
      emailVerificationToken:   autoVerify ? null : token,
      emailVerificationExpires: autoVerify ? null : new Date(Date.now() + VERIFY_TTL),
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

    const verifyUrl = `${APP_URL()}/verify-email?token=${token}`;
    dispatch.emailVerification(user.email, user._id.toString(), verifyUrl, user.firstName).catch(() => {});

    return res.status(201).json({
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
// Identifiant unique : email OU téléphone (voir Login.jsx — un seul champ,
// détection automatique du type saisi).
export const login = async (req, res) => {
  const rawIdentifier = sanitize(req.body.identifier ?? req.body.email ?? req.body.phone);
  const password       = req.body.password;
  if (!rawIdentifier || !password) return res.status(400).json({ message: "Données manquantes." });
  if (password.length > 128) return res.status(400).json({ message: "Mot de passe trop long." });

  const isEmailLike = rawIdentifier.includes("@");
  const email = isEmailLike ? rawIdentifier.toLowerCase() : null;
  const phone = isEmailLike ? null : rawIdentifier;

  try {
    const user = await User.findOne(email ? { email } : { phone });
    if (!user) return res.status(401).json({ message: "Identifiants invalides." });

    if (!user.isActive) {
      return res.status(403).json({ message: "Compte bloqué. Contactez le support VIT AUTO." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: "Identifiants invalides." });

    // Bloquer si email non vérifié (sauf admin, mode dev sans SMTP, ou tant que la
    // vérification email n'est pas exigée — voir emailVerificationRequired()). Ne
    // s'applique que si le compte a effectivement un email (comptes inscrits par
    // téléphone uniquement : user.email est null, rien à vérifier de ce côté).
    if (user.email && !user.emailVerified && user.role !== "admin" && !isDevNoSmtp() && emailVerificationRequired()) {
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

    // La vérification téléphone n'est jamais exigée à la connexion — voir
    // smsConfigured.js (SMS désactivé) : seule l'adresse e-mail est vérifiée, et
    // uniquement à l'inscription (lien envoyé une fois, voir register()). Se
    // connecter ne doit jamais exiger la saisie d'un code.

    // 2FA — si activé, retourner un challenge signé au lieu des tokens. Un
    // jeton dédié (pas le userId brut) preuve que le mot de passe a déjà été
    // vérifié : sans ça, /2fa/verify acceptait n'importe quel userId fourni
    // par l'appelant, permettant de compléter la connexion à un compte tiers
    // en connaissant seulement son secret TOTP (ou un code de secours fuité),
    // sans jamais avoir prouvé connaître le mot de passe.
    if (user.twoFactor?.enabled) {
      const challengeToken = jwt.sign({ id: user._id, purpose: "2fa_challenge" }, JWT_SECRET(), { expiresIn: "10m" });
      return res.json({
        requiresTwoFactor: true,
        challengeToken,
        message: "Code d'authentification requis.",
      });
    }

    // Mettre à jour lastLogin
    user.lastLogin = new Date();

    // Générer refresh token et l'enregistrer (max 5 devices)
    const refreshToken = signRefreshToken(user);
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), hashRefreshToken(refreshToken)];
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
    let user = await User.findOne({
      emailVerificationToken:   token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      // Beaucoup de clients mail (Gmail, Outlook Safe Links, filtres anti-spam
      // d'entreprise) préchargent automatiquement les liens d'un email dès sa
      // réception, AVANT que l'utilisateur ne clique lui-même. Si on invalide le
      // token dès le premier hit, le clic réel de l'utilisateur tombe toujours en
      // échec juste après. On ne le supprime donc plus (voir plus bas) — et ici,
      // si le token ne matche plus une demande active mais correspond à un compte
      // déjà vérifié, on traite quand même le clic comme un succès (idempotent).
      const alreadyVerified = await User.findOne({ emailVerificationToken: token, emailVerified: true });
      if (alreadyVerified) user = alreadyVerified;
    }

    if (!user) {
      return res.status(400).json({
        message: "Lien de vérification invalide ou expiré. Demandez un nouveau lien.",
      });
    }

    user.emailVerified = true;
    await user.save();

    const jwtToken = signJWT(user);
    res.json({
      message: "E-mail vérifié avec succès !",
      success: true,
      user:    safeUser(user),
      token:   jwtToken,
    });
  } catch (err) {
    logger.error("verifyEmail:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Renvoyer l'e-mail de vérification ────────────────────────────────────
export const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "E-mail requis." });

  // Réponse générique systématique (compte inexistant ou déjà vérifié) — même
  // principe que forgotPassword : un 404 différencié ici permettait de sonder
  // l'existence d'un compte par adresse e-mail.
  const genericRes = () => res.json({ message: "Si un compte existe avec cette adresse, un nouveau lien a été envoyé." });
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.emailVerified) return genericRes();

    const token = makeToken();
    user.emailVerificationToken   = token;
    user.emailVerificationExpires = new Date(Date.now() + VERIFY_TTL);
    await user.save();

    const verifyUrl = `${APP_URL()}/verify-email?token=${token}`;
    await dispatch.emailVerification(user.email, user._id.toString(), verifyUrl, user.firstName).catch(() => {});

    genericRes();
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
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    // tokenVersion invalide tout JWT émis avant ce changement (y compris un
    // éventuel token volé) — mais casserait aussi la session en cours de
    // l'appelant lui-même s'il continuait à utiliser son ancien token. On lui
    // renvoie donc immédiatement un nouveau token à jour.
    res.json({ message: "Mot de passe modifié avec succès.", token: signJWT(user) });
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
// Par email (lien) ou par téléphone (OTP Twilio Verify), selon le canal du compte —
// identifier unique en entrée (voir ForgotPassword.jsx).
export const forgotPassword = async (req, res) => {
  const identifier = sanitize(req.body.identifier)?.trim();
  if (!identifier) return res.status(400).json({ message: "Email ou téléphone requis." });

  const isEmailLike = identifier.includes("@");
  const generic = { message: "Si ce compte existe, un code ou un lien a été envoyé." };

  try {
    const user = await User.findOne(isEmailLike ? { email: identifier.toLowerCase() } : { phone: identifier });
    // Toujours répondre OK pour ne pas révéler l'existence d'un compte
    if (!user) return res.json(generic);

    if (isEmailLike) {
      const token = makeToken();
      user.passwordResetToken   = token;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await user.save();

      const resetUrl = `${APP_URL()}/reset-password?token=${token}`;
      dispatch.passwordReset(user.email, user._id.toString(), resetUrl, user.firstName).catch(() => {});
    } else if (twilioVerifyConfigured()) {
      await sendVerification(user.phone).catch((err) => logger.error("forgotPassword (Twilio Verify):", err.message));
    }

    res.json(generic);
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
// Twilio Verify (prioritaire s'il est configuré) génère et gère lui-même le code
// — on ne stocke plus rien localement pour ce provider. Le flux OTP maison
// (génération + hash bcrypt) n'est conservé que pour Africa's Talking / dev.
export const sendPhoneOtp = async (req, res) => {
  // Coupe-circuit AVANT toute lecture/écriture en base : sans ce garde, cet
  // endpoint non authentifié restait exploitable même SMS désactivé — un
  // appelant connaissant (ou devinant) le numéro de téléphone d'un compte tiers
  // pouvait quand même déclencher user.phoneVerified=false + génération d'un
  // OTP stocké en base pour ce compte, avant même de savoir qu'aucun SMS ne
  // sera jamais délivré (voir smsConfigured.js — SMS_ENABLED=false).
  if (!smsConfigured()) {
    return res.status(503).json({
      message: "Le service d'envoi de SMS est momentanément indisponible. Contactez le support VIT AUTO (contact@vit-auto.com) pour vérifier votre compte.",
      smsUnavailable: true,
    });
  }

  const { phone } = req.body;
  const target = phone?.trim();
  if (!target) return res.status(400).json({ message: "Numéro de téléphone requis." });

  try {
    // Toujours le compte de l'appelant authentifié (jamais un `userId` fourni
    // dans le corps de la requête) — sinon n'importe qui connaissant l'ID d'un
    // compte tiers pouvait déclencher l'envoi d'un OTP vers SON téléphone à lui
    // et réinitialiser son statut phoneVerified, sans jamais être ce compte.
    const user = req.user;
    if (user.phoneVerified && user.phone === target) {
      return res.json({ message: "Téléphone déjà vérifié.", alreadyVerified: true });
    }

    if (target) user.phone = target;
    user.phoneVerified = false;

    if (twilioVerifyConfigured()) {
      await user.save();
      const result = await sendVerification(target);
      if (!result.sent) {
        logger.error("sendPhoneOtp (Twilio Verify): échec envoi", { phone: target, error: result.error });
        return res.status(503).json({
          message: "Le service d'envoi de SMS est momentanément indisponible. Contactez le support VIT AUTO (contact@vit-auto.com) pour vérifier votre compte.",
          smsUnavailable: true,
        });
      }
      return res.json({
        message:  `✅ Code envoyé par SMS au ${target}. Vérifiez vos messages.`,
        provider: "twilio_verify",
      });
    }

    // ── Flux OTP maison (Africa's Talking / dev console) ─────────────────
    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    user.phoneOtp        = otpHash;
    user.phoneOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save();

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
  if (!smsConfigured()) {
    return res.status(503).json({ message: "Le service de vérification par SMS est momentanément indisponible.", smsUnavailable: true });
  }

  const { phone, otp } = req.body;
  if (!otp) return res.status(400).json({ message: "Code OTP requis." });

  try {
    // Même principe que sendPhoneOtp — jamais un userId fourni par le client.
    const user = req.user;
    if (user.phoneVerified) return res.json({ message: "Téléphone déjà vérifié.", success: true });

    let otpValid;
    if (twilioVerifyConfigured()) {
      const target = phone?.trim() || user.phone;
      const check = await checkVerification(target, otp);
      otpValid = check.valid;
      if (!otpValid) return res.status(400).json({ message: "Code OTP incorrect ou expiré." });
    } else {
      otpValid = user.phoneOtp && await bcrypt.compare(otp, user.phoneOtp);
      if (!otpValid) {
        return res.status(400).json({ message: "Code OTP incorrect." });
      }
      if (!user.phoneOtpExpires || user.phoneOtpExpires < new Date()) {
        return res.status(400).json({ message: "Code OTP expiré. Demandez un nouveau code." });
      }
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
    const tokenHash = hashRefreshToken(token);
    if (!user.refreshTokens || !user.refreshTokens.includes(tokenHash)) {
      return res.status(401).json({ message: "Refresh token révoqué ou invalide." });
    }

    // Rotation : remplacer l'ancien refresh token par un nouveau
    const newRefreshToken = signRefreshToken(user);
    user.refreshTokens = user.refreshTokens
      .filter((t) => t !== tokenHash)
      .concat(hashRefreshToken(newRefreshToken))
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
      $pull: { refreshTokens: hashRefreshToken(token) },
    });
    res.json({ message: "Token révoqué avec succès." });
  } catch {
    res.json({ message: "Token révoqué (ou déjà invalide)." });
  }
};

// ── Réinitialisation du mot de passe ──────────────────────────────────────
// Deux chemins : { token, password } (lien email) ou { phone, otp, password }
// (OTP Twilio Verify) — voir forgotPassword() ci-dessus.
export const resetPassword = async (req, res) => {
  const { token, phone, otp, password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères." });
  }
  if (!token && !(phone && otp)) {
    return res.status(400).json({ message: "Token ou (téléphone + code) requis." });
  }

  try {
    let user;

    if (token) {
      user = await User.findOne({
        passwordResetToken:   token,
        passwordResetExpires: { $gt: new Date() },
      });
      if (!user) {
        return res.status(400).json({ message: "Lien invalide ou expiré. Recommencez la procédure." });
      }
    } else {
      const target = phone.trim();
      user = await User.findOne({ phone: target });
      if (!user) {
        return res.status(400).json({ message: "Code invalide ou expiré. Recommencez la procédure." });
      }
      const check = twilioVerifyConfigured()
        ? await checkVerification(target, otp)
        : { valid: false };
      if (!check.valid) {
        return res.status(400).json({ message: "Code invalide ou expiré. Recommencez la procédure." });
      }
    }

    user.password             = await bcrypt.hash(password, 12);
    user.passwordResetToken   = null;
    user.passwordResetExpires = null;
    user.refreshTokens        = [];
    user.tokenVersion         = (user.tokenVersion || 0) + 1;
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
    const { challengeToken, token } = req.body;
    if (!challengeToken || !token) return res.status(400).json({ message: "challengeToken et token requis." });

    let decoded;
    try {
      decoded = jwt.verify(challengeToken, JWT_SECRET());
    } catch {
      return res.status(401).json({ message: "Session de connexion expirée. Reconnectez-vous." });
    }
    if (decoded.purpose !== "2fa_challenge") return res.status(401).json({ message: "Jeton invalide." });

    const user = await User.findById(decoded.id);
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
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), hashRefreshToken(refreshToken)];
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
