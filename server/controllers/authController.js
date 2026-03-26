import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const SECRET = process.env.JWT_SECRET || "secretkey";

export const register = async (req, res) => {
  const { firstName, lastName, email, password, phone } = req.body;
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ message: "Données manquantes" });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email déjà utilisé" });

    const foundAdmin = await User.findOne({ role: "admin" });
    const role = foundAdmin ? "user" : "admin";

    const hash = await bcrypt.hash(password, 10);
    const userDoc = { firstName, lastName, email: email.toLowerCase(), password: hash, phone, role, createdAt: new Date() };
    const user = await User.create(userDoc);
    
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
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Données manquantes" });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
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
};

export const getMe = async (req, res) => {
  res.json({ user: { id: req.user._id, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, phone: req.user.phone, role: req.user.role } });
};

