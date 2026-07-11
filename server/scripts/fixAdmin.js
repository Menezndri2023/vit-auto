import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Même ordre de chargement que createAdmin.js / resetAdminPassword.js (racine du
// projet, puis server/, puis défaut) — auparavant ce script ne chargeait QUE
// server/.env et échouait silencieusement si MONGO_URI ne vivait que dans le .env racine.
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

// Même variable ADMIN_SEED_EMAIL que les deux autres scripts admin — sinon un
// opérateur qui la définit pour créer/réinitialiser l'admin voit CE script agir
// silencieusement sur "admin@vitauto.ci" (qui peut ne pas exister) au lieu du bon compte.
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || "admin@vitauto.ci";

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI non défini.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const res = await mongoose.connection.db.collection("users").updateOne(
    { email: ADMIN_EMAIL },
    { $set: { emailVerified: true, isActive: true, role: "admin" } }
  );
  console.log("✅ Admin mis à jour:", res.modifiedCount, "document(s)");
  const admin = await mongoose.connection.db.collection("users").findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    console.error(`❌  Aucun compte trouvé avec l'email ${ADMIN_EMAIL}.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log("   email        :", admin.email);
  console.log("   emailVerified:", admin.emailVerified);
  console.log("   isActive     :", admin.isActive);
  console.log("   role         :", admin.role);
  await mongoose.disconnect();
}

main().catch(console.error);
