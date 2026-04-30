/**
 * Script : Créer le compte administrateur VIT AUTO
 * Usage  : node server/scripts/createAdmin.js
 */

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Cherche .env à la racine du projet (un ou deux niveaux au-dessus)
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

const ADMIN = {
  firstName: "Admin",
  lastName:  "VIT AUTO",
  email:     "admin@vitauto.ci",
  password:  "Admin@2026!",
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
    console.log(`ℹ️  Le compte admin existe déjà :`);
    console.log(`   Email    : ${ADMIN.email}`);
    console.log(`   Mot de passe : Admin@2026!`);
    console.log(`\n👉 Connecte-toi sur http://localhost:5173/login`);
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
