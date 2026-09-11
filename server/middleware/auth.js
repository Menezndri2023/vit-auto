import jwt from "jsonwebtoken";
import User from "../models/User.js";
import logger from "../utils/logger.js";
import { isAccessTokenRevoked } from "../utils/tokenRevocation.js";
import { signerDocumentsPrives } from "../utils/signerDocuments.js";

// ── Authentification JWT ────────────────────────────────────────────────────
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Non autorisé" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Faille CRITIQUE corrigée (audit sécurité 2026-09) — CONTOURNEMENT DU 2FA.
    // Les jetons à usage restreint (challenge 2FA émis par /auth/login quand la
    // double authentification est active) sont signés avec la MÊME clé que les
    // jetons d'accès. Sans ce contrôle, un tel jeton authentifiait normalement :
    // un attaquant en possession du seul mot de passe recevait le challenge,
    // ignorait l'écran du code, et s'en servait comme session complète pendant
    // 10 minutes — puis appelait /auth/2fa/disable (qui n'exige que le mot de
    // passe) pour supprimer définitivement le second facteur. Le 2FA ne
    // protégeait donc contre rien.
    // Refus GÉNÉRIQUE de tout `purpose` : un jeton à usage restreint introduit
    // plus tard (lien signé, action ponctuelle) est couvert d'office.
    if (decoded.purpose) {
      return res.status(401).json({
        message: "Ce jeton ne permet pas d'accéder à cette ressource.",
      });
    }

    // Faille réelle corrigée (audit) : une déconnexion volontaire (revokeRefreshToken)
    // ne révoquait que le refresh token — ce JWT d'accès restait valide jusqu'à
    // 7 jours. Vérification par jti, no-op silencieux si Redis indisponible
    // (voir tokenRevocation.js — dégradé, jamais bloquant pour l'authentification).
    if (decoded.jti && await isAccessTokenRevoked(decoded.jti)) {
      return res.status(401).json({ message: "Session déconnectée. Reconnectez-vous." });
    }

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
    // Les documents privés (pièces d'identité, documents d'entreprise) ne sont
    // lisibles que par URL signée. Installé ICI, une fois pour toutes les
    // requêtes authentifiées, plutôt que dans chacun des contrôleurs qui les
    // renvoient — voir utils/signerDocuments.js.
    signerDocumentsPrives(req, res, next);
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
    if (decoded.jti && await isAccessTokenRevoked(decoded.jti)) return next(); // mode invité, pas d'erreur ici
    const user = await User.findById(decoded.id)
      .select("-password -phoneOtp -passwordResetToken -emailVerificationToken -twoFactor.secret -refreshTokens");
    if (user && user.isActive && (decoded.tokenVersion || 0) === (user.tokenVersion || 0)) req.user = user;
  } catch {
    // Token invalide → mode invité
  }
  // Même traitement que `authenticate` dès qu'un utilisateur est reconnu : une
  // route à authentification facultative peut renvoyer un document privé à
  // son propriétaire (pièce jointe d'une réservation, par exemple).
  if (req.user) return signerDocumentsPrives(req, res, next);
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
// combine : req.user.role === "admin" est déjà requis en amont sur ces routes).
//
// Modèle à deux niveaux (voir constants/adminScopes.js) :
//
//   ADMIN GÉNÉRAL — accès à TOUTE l'administration, sans exception.
//     C'est le niveau par DÉFAUT de tout compte administrateur : aucune
//     permission à demander ni à attribuer, être admin suffit. Correspond à un
//     adminScope vide (le défaut) ou contenant explicitement "super_admin".
//
//   ADMIN À ACCÈS ASSIGNÉ — restriction OPT-IN.
//     Dès qu'un administrateur général lui attribue un ou plusieurs domaines,
//     le compte est strictement limité à ceux-ci, côté serveur comme côté
//     interface.
//
// La restriction est donc toujours une décision explicite, jamais un état par
// défaut : un compte ne peut pas se retrouver administrateur sans aucun droit,
// situation qui rendait le panneau d'administration vide et incompréhensible.
const isGeneralAdminUser = (user) => {
  const scopes = user?.adminScope || [];
  return scopes.length === 0 || scopes.includes("super_admin");
};

export const requireAdminScope = (scope) => (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }
  if (isGeneralAdminUser(req.user) || (req.user.adminScope || []).includes(scope)) {
    return next();
  }
  return res.status(403).json({
    message: `Accès refusé — permission « ${scope} » requise. Demandez-la à un administrateur général.`,
    requiredScope: scope,
  });
};

// Certaines zones relèvent de PLUSIEURS secteurs à la fois : la logistique
// Import/Export, par exemple, concerne aussi bien un admin assigné au secteur
// "import_export" qu'un admin assigné au secteur "transitaire". Il suffit alors
// d'être assigné à l'un d'eux.
export const requireAnyAdminScope = (...scopes) => (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }
  const mine = req.user.adminScope || [];
  if (isGeneralAdminUser(req.user) || scopes.some((s) => mine.includes(s))) {
    return next();
  }
  return res.status(403).json({
    message: `Accès refusé — l'un de ces secteurs est requis : ${scopes.join(", ")}. Demandez-le à l'administrateur général.`,
    requiredScope: scopes,
  });
};

// Réservé à l'ADMIN GÉNÉRAL (gestion des comptes admin eux-mêmes, journal
// d'audit) — un accès assigné ne peut pas y suppléer.
export const requireGeneralAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }
  if (isGeneralAdminUser(req.user)) return next();
  return res.status(403).json({
    message: "Action réservée à l'administrateur général.",
    requiredScope: "super_admin",
  });
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
