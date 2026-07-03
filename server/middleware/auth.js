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
    if (user && user.isActive) req.user = user;
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
