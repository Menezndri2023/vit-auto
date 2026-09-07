/**
 * Script : Lister les comptes administrateurs VIT AUTO
 * Usage  : node server/scripts/listAdmins.js
 *
 * LECTURE SEULE — n'écrit jamais rien en base.
 *
 * Les mots de passe ne sont volontairement PAS affichables : ils sont stockés
 * hachés (bcrypt), une transformation irréversible. Personne ne peut les
 * relire — ni un administrateur, ni quelqu'un qui obtiendrait une copie de la
 * base. Pour reprendre la main sur un compte, utilisez
 * `node server/scripts/resetAdminPassword.js`, qui définit un nouveau mot de
 * passe et l'affiche une seule fois.
 *
 * Ce script vérifie en plus si un compte utilise encore le mot de passe qui a
 * été committé en clair dans une ancienne version de createAdmin.js : ce mot de
 * passe est public dans l'historique git, donc à changer immédiatement.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

// Mot de passe historiquement codé en dur dans createAdmin.js, donc public dans
// l'historique git — voir l'avertissement de ce même script.
const LEAKED_PASSWORD = "Admin@2026!";

const SCOPE_LABELS = {
  super_admin:   "👑 ADMIN GÉNÉRAL (tout)",
  finance:       "💰 Finance",
  bookings:      "📋 Réservations",
  users:         "👥 Comptes",
  catalogue:     "🚗 Catalogue",
  partners:      "🤝 Partenaires",
  kyc:           "🛡️  KYC & Identités",
  import_export: "🌍 Import / Export",
  support:       "💬 Support client",
  moderation:    "🚩 Modération",
};

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI non défini (server/.env).");
    process.exit(1);
  }

  await mongoose.connect(uri);

  // Schéma minimal, en lecture seule : ce script ne doit jamais pouvoir écrire.
  const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }), "users");
  const admins = await User.find({ role: "admin" })
    .select("firstName lastName email phone adminScope isActive createdAt lastLogin password")
    .sort({ createdAt: 1 })
    .lean();

  if (!admins.length) {
    console.log("\n⚠️  Aucun compte administrateur en base.");
    console.log("   Créez-en un : node server/scripts/createAdmin.js\n");
    await mongoose.disconnect();
    return;
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${admins.length} compte(s) administrateur`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  let leakedCount = 0;
  let generalCount = 0;

  for (const a of admins) {
    const scopes = a.adminScope || [];
    const isGeneral = scopes.includes("super_admin");
    if (isGeneral && a.isActive !== false) generalCount += 1;

    console.log(`  ${a.isActive === false ? "🚫" : "✅"}  ${a.firstName || ""} ${a.lastName || ""}`.trimEnd());
    console.log(`      Identifiant  : ${a.email || "(aucun email)"}`);
    if (a.phone) console.log(`      Téléphone    : ${a.phone}`);
    console.log(`      Statut       : ${a.isActive === false ? "DÉSACTIVÉ" : "actif"}`);
    console.log(`      Permissions  : ${
      scopes.length === 0
        ? "⚠️  AUCUNE — ce compte ne peut rien faire (à attribuer depuis Rôles & Permissions)"
        : scopes.map((s) => SCOPE_LABELS[s] || s).join(", ")
    }`);
    if (a.lastLogin)  console.log(`      Dernière connexion : ${new Date(a.lastLogin).toLocaleString("fr-FR")}`);
    if (a.createdAt)  console.log(`      Créé le      : ${new Date(a.createdAt).toLocaleDateString("fr-FR")}`);

    // Vérification de sécurité : ce compte utilise-t-il encore le mot de passe
    // qui a fuité dans l'historique git ?
    if (a.password && await bcrypt.compare(LEAKED_PASSWORD, a.password).catch(() => false)) {
      leakedCount += 1;
      console.log(`      🔴 ALERTE : ce compte utilise le mot de passe committé en clair`);
      console.log(`         dans une ancienne version du code — il est PUBLIC dans`);
      console.log(`         l'historique git. À changer immédiatement.`);
    }
    console.log("");
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Administrateurs généraux actifs : ${generalCount}`);
  if (generalCount === 0) {
    console.log(`  🔴 AUCUN administrateur général actif — la plateforme ne peut plus`);
    console.log(`     être administrée. Corrigez en base ou via createAdmin.js.`);
  }
  if (leakedCount > 0) {
    console.log(`  🔴 ${leakedCount} compte(s) avec un mot de passe public — changez-les :`);
    console.log(`     node server/scripts/resetAdminPassword.js`);
  }
  console.log(`\n  Les mots de passe ne sont pas affichables (hachage bcrypt,`);
  console.log(`  irréversible par construction). Pour en définir un nouveau :`);
  console.log(`     node server/scripts/resetAdminPassword.js`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ ", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
