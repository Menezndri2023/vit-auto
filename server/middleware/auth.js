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

    req.user = user;

    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Token invalide" });
  }
};

// 👑 Autorisation admin
export const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès refusé (admin uniquement)" });
  }
  next();
};