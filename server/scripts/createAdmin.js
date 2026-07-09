/**
 * Script : Créer le compte administrateur VIT AUTO
 * Usage  : node server/scripts/createAdmin.js
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Cherche .env à la racine du projet (un ou deux niveaux au-dessus)
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

// Mot de passe : ADMIN_SEED_PASSWORD si fourni, sinon généré aléatoirement à
// chaque exécution (jamais de mot de passe en dur dans le code source — un
// mot de passe admin codé en dur committé dans git est un identifiant valide
// que quiconque lit le dépôt peut utiliser).
const ADMIN = {
  firstName: "Admin",
  lastName:  "VIT AUTO",
  email:     process.env.ADMIN_SEED_EMAIL || "admin@vitauto.ci",
  password:  process.env.ADMIN_SEED_PASSWORD || crypto.randomBytes(12).toString("base64url"),
  role:      "admin",
  isActive:  true,
};

const userSchema = new mongoose.Schema({
  firstName:  String,
  lastName:   String,
  email:      { type: String, unique: true },
  password:   String,
  phone:      String,
  role:       { type: String, default: "client" },
  isActive:   { type: Boolean, default: true },
  createdAt:  { type: Date, default: Date.now },
}, { strict: false });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI non défini dans .env");
    process.exit(1);
  }

  console.log("⏳  Connexion à MongoDB...");
  await mongoose.connect(uri);
  console.log("✅  Connecté à MongoDB\n");

  const User = mongoose.models.User || mongoose.model("User", userSchema);

  // Vérifier si un admin existe déjà
  const existing = await User.findOne({ email: ADMIN.email });
  if (existing) {
    console.log(`ℹ️  Le compte admin existe déjà : ${ADMIN.email}`);
    console.log(`   Ce script ne réinitialise jamais un mot de passe existant.`);
    console.log(`   Mot de passe oublié → utilisez le flux "mot de passe oublié" ou changez-le en base.`);
    console.log(`\n⚠️  Si ce compte a été créé par une ancienne version de ce script avec le mot`);
    console.log(`   de passe "Admin@2026!" (committé en clair dans une version antérieure du code),`);
    console.log(`   changez-le IMMÉDIATEMENT — ce mot de passe est public dans l'historique git.`);
    await mongoose.disconnect();
    return;
  }

  const hash = await bcrypt.hash(ADMIN.password, 10);
  await User.create({ ...ADMIN, password: hash });

  console.log("✅  Compte admin créé avec succès !\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   Email    : ${ADMIN.email}`);
  console.log(`   Mot de passe : ${ADMIN.password}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`\n👉 Connecte-toi sur http://localhost:5173/login`);
  console.log(`👉 Dashboard admin : http://localhost:5173/admin\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Erreur :", err.message);
  process.exit(1);
});
