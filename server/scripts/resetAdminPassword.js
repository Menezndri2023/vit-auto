/**
 * Script : Réinitialiser le mot de passe du compte administrateur VIT AUTO
 * Usage  : node server/scripts/resetAdminPassword.js
 *
 * Contrairement à createAdmin.js (qui ne touche jamais un compte existant),
 * ce script réinitialise explicitement le mot de passe d'un admin déjà présent
 * en base — à utiliser quand les identifiants admin ne fonctionnent plus.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

const ADMIN_EMAIL    = process.env.ADMIN_SEED_EMAIL || "admin@vitauto.ci";
// Nouveau mot de passe fourni via ADMIN_RESET_PASSWORD, sinon généré aléatoirement
// et affiché une seule fois — jamais de mot de passe en dur dans le code source.
const NEW_PASSWORD   = process.env.ADMIN_RESET_PASSWORD || crypto.randomBytes(12).toString("base64url");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI non défini.");
    process.exit(1);
  }

  console.log("⏳  Connexion à MongoDB...");
  await mongoose.connect(uri);
  console.log("✅  Connecté à MongoDB\n");

  const users = mongoose.connection.db.collection("users");
  const admin = await users.findOne({ email: ADMIN_EMAIL });

  if (!admin) {
    console.error(`❌  Aucun compte trouvé avec l'email ${ADMIN_EMAIL}.`);
    console.error(`   Utilisez createAdmin.js pour en créer un.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 12);
  await users.updateOne(
    { email: ADMIN_EMAIL },
    { $set: { password: hash, role: "admin", isActive: true, emailVerified: true } }
  );

  console.log("✅  Mot de passe admin réinitialisé avec succès !\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   Email        : ${ADMIN_EMAIL}`);
  console.log(`   Mot de passe : ${NEW_PASSWORD}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`\n⚠️  Notez ce mot de passe MAINTENANT — il n'est affiché qu'une seule fois.`);
  console.log(`👉 Connectez-vous puis changez-le immédiatement depuis /profile (onglet Sécurité).\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Erreur :", err.message);
  process.exit(1);
});
