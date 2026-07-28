/**
 * Script : réinitialise Vehicle.currency à null pour toutes les annonces existantes
 * Usage  : cd server && node scripts/migrate-vehicle-currency-reset.mjs [--execute]
 *
 * Contexte : `currency` existait déjà sur le schéma (default "USD") mais
 * n'était encore utilisé PAR AUCUN code — ni pour l'affichage catalogue
 * (toujours converti dans la devise détectée par IP du visiteur), ni comme
 * un vrai choix du partenaire. Chaque annonce existante porte donc "USD" en
 * base uniquement parce que c'était la valeur par défaut du schéma au moment
 * de sa création (Mongoose écrit les defaults sur disque), jamais parce que
 * quelqu'un l'a réellement choisi.
 *
 * `currency` prend maintenant un sens réel : null = "devise du visiteur"
 * (comportement automatique, par défaut), une valeur explicite = "toujours
 * afficher cette annonce dans cette devise, quel que soit le visiteur"
 * (choix du partenaire/admin, voir vehicleController). Sans cette
 * réinitialisation, TOUTES les annonces existantes se retrouveraient
 * silencieusement "figées en USD" pour tout le monde dès le déploiement de
 * cette fonctionnalité — une régression pour les visiteurs qui voyaient
 * jusqu'ici leur propre devise détectée.
 *
 * Dry-run par défaut (aucune écriture) — ajouter --execute pour appliquer.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

export async function resetVehicleCurrency({ dryRun = true } = {}) {
  const { default: Vehicle } = await import("../models/Vehicle.js");
  const count = await Vehicle.countDocuments({ currency: { $ne: null } });
  if (dryRun) return { total: count, updated: 0 };

  const result = await Vehicle.updateMany({ currency: { $ne: null } }, { $set: { currency: null } });
  return { total: count, updated: result.modifiedCount };
}

async function run() {
  const EXECUTE = process.argv.includes("--execute");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connecté à MongoDB.", EXECUTE ? "MODE EXÉCUTION RÉELLE" : "MODE DRY-RUN (aucune écriture)");

  const report = await resetVehicleCurrency({ dryRun: !EXECUTE });
  console.log(`\n${EXECUTE ? "── EXÉCUTION" : "── DRY-RUN"} — Vehicle.currency → null ──`);
  console.log(`Annonces avec currency !== null trouvées : ${report.total}`);
  if (EXECUTE) console.log(`Réinitialisées : ${report.updated}`);
  else console.log("Relancer avec --execute pour appliquer.");

  await mongoose.disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error("Erreur de migration:", err);
    process.exit(1);
  });
}
