/**
 * Marque (ou démarque) les comptes de test, SANS jamais les supprimer.
 *
 *   node scripts/marquerComptesDeTest.mjs                    # simulation
 *   node scripts/marquerComptesDeTest.mjs --apply            # marque
 *   node scripts/marquerComptesDeTest.mjs --apply --email x  # marque un compte précis
 *   node scripts/marquerComptesDeTest.mjs --apply --demarquer --email x
 *
 * Un compte marqué reste PLEINEMENT fonctionnel — connexion, publication,
 * réservation. Il disparaît seulement des surfaces publiques : catalogue,
 * statistiques d'accueil, annuaire des showrooms, vitrines de mise en avant.
 * L'administration continue de le voir. C'est réversible, contrairement à une
 * suppression.
 *
 * Détection automatique : uniquement les domaines RÉSERVÉS par la norme
 * (RFC 2606/6761). Pour un compte hors convention — « t-partner-...@ex.com » —
 * passer son adresse en --email : aucune règle automatique ne peut le
 * reconnaître sans risquer d'emporter un compte légitime.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const APPLIQUER = process.argv.includes("--apply");
const DEMARQUER = process.argv.includes("--demarquer");
const idxEmail  = process.argv.indexOf("--email");
const EMAIL     = idxEmail !== -1 ? process.argv[idxEmail + 1] : null;

const { REGEX_EMAIL_DE_TEST } = await import("../constants/testAccounts.js");

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
const User = (await import("../models/User.js")).default;

const filtre = EMAIL
  ? { email: String(EMAIL).toLowerCase().trim() }
  : { email: REGEX_EMAIL_DE_TEST };

const comptes = await User.find(filtre).select("firstName lastName email role isTestAccount").lean();

if (!comptes.length) {
  console.log("Aucun compte ne correspond.");
} else {
  const verbe = DEMARQUER ? "DÉMARQUER" : "MARQUER";
  console.log(`${verbe} — ${comptes.length} compte(s) :`);
  for (const u of comptes) {
    const etat = u.isTestAccount ? "déjà marqué" : "non marqué";
    console.log(`  ${[u.firstName, u.lastName].filter(Boolean).join(" ").padEnd(24)} ${String(u.email).padEnd(46)} role=${String(u.role).padEnd(11)} (${etat})`);
  }

  if (APPLIQUER) {
    const r = await User.updateMany(filtre, { $set: { isTestAccount: !DEMARQUER } });
    console.log(`\n${r.modifiedCount} compte(s) mis à jour. Aucun compte supprimé.`);
  } else {
    console.log("\nSimulation. Relancer avec --apply pour appliquer.");
  }
}

await mongoose.disconnect();
