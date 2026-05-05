import jwt from "jsonwebtoken";
import User from "../models/User.js";

// 🔐 Authentification
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Non autorisé" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "Utilisateur introuvable" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Compte bloqué." });
    }

    req.user = user;
    next();
  } catch (err) {
    // Log discret — pas de stack trace pour les erreurs JWT courantes
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token invalide ou expiré." });
    }
    console.error("Auth error:", err.message);
    res.status(401).json({ message: "Authentification échouée." });
  }
};

// 👑 Autorisation admin
export const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès refusé (admin uniquement)" });
  }
  next();
};

// 🔓 Auth optionnelle — définit req.user si token valide, sinon continue sans bloquer
export const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.isActive) req.user = user;
  } catch {
    // Token invalide ou expiré → on continue en mode invité
  }
  next();
};