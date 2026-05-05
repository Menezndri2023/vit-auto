import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import { transporter, FROM_ADDRESS, emailVerificationTemplate, passwordResetTemplate } from "../config/email.js";

const JWT_SECRET  = () => process.env.JWT_SECRET;           // obligatoire — server.js vérifie au démarrage
const APP_URL     = () => process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
const VERIFY_TTL  = 24 * 60 * 60 * 1000; // 24h en ms

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

function safeUser(u) {
  return {
    id:              u._id,
    firstName:       u.firstName,
    lastName:        u.lastName,
    email:           u.email,
    phone:           u.phone,
    role:            u.role,
    emailVerified:   u.emailVerified,
    identityStatus:  u.identity?.status || "not_submitted",
    documentsVerified: u.documentsVerified,
    profilePhoto:    u.profilePhoto,
  };
}

// true quand on est en dev ET que le SMTP n'est pas configuré
const smtpConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const isDevNoSmtp = () =>
  process.env.NODE_ENV !== "production" && !smtpConfigured();

// ── Inscription ───────────────────────────────────────────────────────────
export const register = async (req, res) => {
  const { firstName, lastName, email, password, phone, role } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ message: "Données manquantes." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caractères." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Format d'e-mail invalide." });
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
      email: email.toLowerCase(),
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
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Données manquantes." });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
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

    // Mettre à jour lastLogin
    user.lastLogin = new Date();
    await user.save();

    const token = signJWT(user);

    res.json({
      user: safeUser(user),
      token,
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
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
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
  if (process.env.NODE_ENV === "production") {
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

// ── Réinitialisation du mot de passe ──────────────────────────────────────
export const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ message: "Token et nouveau mot de passe requis." });
  if (password.length < 6) return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caractères." });

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
