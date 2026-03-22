import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { useDB } from "../db/index.js";

const router = express.Router();

const SECRET = process.env.JWT_SECRET || "secretkey";

router.post("/register", async (req, res) => {
  const { firstName, lastName, email, password, phone } = req.body;
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ message: "Données manquantes" });
  }

  try {
    const db = useDB(User, "users");
    const existing = await db.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email déjà utilisé" });

    const foundAdmin = await db.findOne({ role: "admin" });
    const role = foundAdmin ? "user" : "admin";

    const hash = await bcrypt.hash(password, 10);
    const userDoc = { firstName, lastName, email: email.toLowerCase(), password: hash, phone, role, createdAt: new Date() };
    const user = await db.create(userDoc);
    
    const token = jwt.sign({ id: user._id, email: user.email, role }, SECRET, { expiresIn: "7d" });

    res.json({ 
      user: { 
        id: user._id, 
        firstName: user.firstName, 
        lastName: user.lastName, 
        email: user.email, 
        phone: user.phone,
        role: user.role 
      }, 
      token 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Données manquantes" });

  try {
    const db = useDB(User, "users");
    const user = await db.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Identifiants invalides" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: "Identifiants invalides" });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, SECRET, { expiresIn: "7d" });
    res.json({ 
      user: { 
        id: user._id, 
        firstName: user.firstName, 
        lastName: user.lastName, 
        email: user.email, 
        phone: user.phone,
        role: user.role 
      }, 
      token 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

router.get("/me", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Token manquant" });

  const token = auth.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    const db = useDB(User, "users");
    const user = await db.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
    res.json({ user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, role: user.role } });
  } catch {
    res.status(401).json({ message: "Token invalide" });
  }
});

export default router;
