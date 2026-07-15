import jwt from "jsonwebtoken";
import User from "../models/User.js";
import logger from "../utils/logger.js";

// ── Authentification JWT ────────────────────────────────────────────────────
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Non autorisé" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select("-password -phoneOtp -passwordResetToken -emailVerificationToken -twoFactor.secret -refreshTokens");

    if (!user) return res.status(401).json({ message: "Utilisateur introuvable" });
    if (!user.isActive) return res.status(403).json({ message: "Compte bloqué." });
    // Un changement/réinitialisation de mot de passe incrémente tokenVersion
    // (voir changePassword/resetPassword) — un JWT émis avant reste signé
    // valide jusqu'à 7 jours sinon, y compris s'il a été volé. `|| 0` couvre
    // les tokens émis avant l'introduction de ce champ (jamais forcés à se
    // déconnecter par ce déploiement, seuls les changements de mot de passe
    // FUTURS invalident réellement une session).
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "Session expirée suite à un changement de mot de passe. Reconnectez-vous." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token invalide ou expiré." });
    }
    logger.error("Auth error:", { error: err.message });
    res.status(401).json({ message: "Authentification échouée." });
  }
};

// ── Auth optionnelle — req.user si token valide, sinon invité ───────────────
export const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select("-password -phoneOtp -passwordResetToken -emailVerificationToken -twoFactor.secret -refreshTokens");
    if (user && user.isActive && (decoded.tokenVersion || 0) === (user.tokenVersion || 0)) req.user = user;
  } catch {
    // Token invalide → mode invité
  }
  next();
};

// ── RBAC — requireRole(roles) ───────────────────────────────────────────────
// Usage : requireRole("admin")  ou  requireRole(["admin", "partenaire"])
// Doit être appelé APRÈS authenticate.
//
// Hiérarchie des rôles actuels :
//   admin       → toutes les permissions
//   partenaire  → gestion de son catalogue, ses réservations
//   chauffeur   → gestion de son profil chauffeur
//   client      → réservations, profil
//
// Rôles cibles (migration progressive vers RBAC complet) :
//   super_admin, administrator, support, finance, partner_manager,
//   manufacturer, dealer, rental_company, professional_driver,
//   buyer, seller, customer
export const requireRole = (roles) => (req, res, next) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user) return res.status(401).json({ message: "Non authentifié." });
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({
      message: `Accès refusé. Rôle requis : ${allowed.join(" ou ")}.`,
    });
  }
  next();
};

// ── Rétrocompatibilité — alias de requireRole("admin") ─────────────────────
export const authorizeAdmin = requireRole("admin");

// ── Permissions fines admin (Rôles & Permissions) ───────────────────────────
// Doit être appelée APRÈS authenticate (ne remplace pas authorizeAdmin, la
// combine : req.user.role === "admin" est déjà requis en amont sur ces
// routes). Un admin avec adminScope=[] (défaut — comptes existants avant
// l'ajout de ce champ) ou contenant "super_admin" garde un accès complet :
// ce garde-fou n'exclut jamais un admin par accident, il n'ajoute des
// restrictions qu'aux comptes explicitement scopés par un super admin.
export const requireAdminScope = (scope) => (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }
  const scopes = req.user.adminScope || [];
  if (scopes.length === 0 || scopes.includes("super_admin") || scopes.includes(scope)) {
    return next();
  }
  return res.status(403).json({ message: `Accès refusé — permission "${scope}" requise.` });
};

// ── Vérification propriété — l'utilisateur doit être propriétaire OU admin ──
// Usage : requireOwnership(resource, "ownerId")
// resource doit être un objet avec la clé passée en deuxième argument.
export const requireOwnership = (resource, ownerField = "user") => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Non authentifié." });
  if (req.user.role === "admin") return next(); // admin passe toujours
  const ownerId = resource[ownerField]?.toString?.();
  if (!ownerId || ownerId !== req.user._id.toString()) {
    return res.status(403).json({ message: "Accès refusé (vous n'êtes pas le propriétaire)." });
  }
  next();
};
