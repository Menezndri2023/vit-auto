/**
 * Script : donner le statut d'ADMINISTRATEUR GÉNÉRAL à un compte
 * Usage  : node server/scripts/promoteGeneralAdmin.js [email]
 *          node server/scripts/promoteGeneralAdmin.js --all
 *
 * L'administrateur général a accès à TOUTE l'administration VIT AUTO, sans
 * exception, et il est le seul à pouvoir gérer les autres comptes admin.
 *
 * À quoi ça sert : rendre EXPLICITE le statut d'un compte, ou RE-DONNER
 * l'accès complet à un administrateur qui avait été restreint à certains
 * domaines. Un compte admin sans domaine assigné est déjà administrateur
 * général — il n'a besoin de rien d'autre que ses identifiants de connexion.
 *
 * Sans argument, il cible ADMIN_SEED_EMAIL (ou le compte de départ).
 * Avec --all, il rend l'accès complet à TOUS les comptes admin.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

const arg = process.argv[2];
const ALL = arg === "--all";
const EMAIL = ALL ? null : (arg || process.env.ADMIN_SEED_EMAIL || "admin@vitauto.ci");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI non défini (server/.env).");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const users = mongoose.connection.db.collection("users");

  // --all : rend l'accès complet à TOUS les comptes admin, y compris ceux qui
  // avaient été restreints à des domaines (filet de secours).
  const filter = ALL ? { role: "admin" } : { email: EMAIL, role: "admin" };

  const targets = await users.find(filter).project({ email: 1, firstName: 1, lastName: 1, adminScope: 1 }).toArray();

  if (!targets.length) {
    if (ALL) {
      console.log("\n✅  Aucun compte admin en base — rien à faire.\n");
    } else {
      console.error(`\n❌  Aucun compte ADMIN trouvé avec l'email ${EMAIL}.`);
      const admins = await users.find({ role: "admin" }).project({ email: 1, adminScope: 1 }).toArray();
      if (admins.length) {
        console.error(`\n   Comptes admin existants :`);
        admins.forEach((a) => {
          const s = a.adminScope || [];
          const niveau = s.length === 0 || s.includes("super_admin")
            ? "👑 administrateur général (accès à tout)"
            : `accès assigné — ${s.join(", ")}`;
          console.error(`     • ${a.email}  —  ${niveau}`);
        });
        console.error(`\n   Relancez avec l'un d'eux, ou avec --all pour rendre`);
        console.error(`   l'accès complet à tous les comptes admin.`);
      } else {
        console.error(`   Aucun compte admin en base : node server/scripts/createAdmin.js`);
      }
      await mongoose.disconnect();
      process.exit(1);
    }
    await mongoose.disconnect();
    return;
  }

  const deja = targets.filter((t) => (t.adminScope || []).includes("super_admin"));
  const aPromouvoir = targets.filter((t) => !(t.adminScope || []).includes("super_admin"));

  for (const t of deja) {
    console.log(`ℹ️   ${t.email} est déjà administrateur général — inchangé.`);
  }

  if (aPromouvoir.length) {
    await users.updateMany(
      { _id: { $in: aPromouvoir.map((t) => t._id) } },
      { $set: { adminScope: ["super_admin"] } }
    );
    console.log(`\n✅  ${aPromouvoir.length} compte(s) promu(s) ADMINISTRATEUR GÉNÉRAL :`);
    aPromouvoir.forEach((t) => console.log(`     👑 ${t.email}  (${t.firstName || ""} ${t.lastName || ""})`.trimEnd()));
    console.log(`\n   Accès complet à toute l'administration VIT AUTO.`);
    console.log(`   👉 Déconnectez-vous puis reconnectez-vous pour que la session`);
    console.log(`      reprenne les nouvelles permissions.\n`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ ", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
