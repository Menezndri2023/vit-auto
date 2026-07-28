/**
 * Script : réinitialise Vehicle.currency à null pour les annonces existantes
 * Usage  : cd server && node scripts/migrate-vehicle-currency-reset.mjs [--execute]
 *
 * REDONDANT depuis l'ajout de runOnceMigration("vehicle-currency-reset-2026-07-28")
 * dans server.js — cette même réinitialisation s'applique désormais TOUTE
 * SEULE au premier démarrage du serveur après déploiement, sans dépendre
 * qu'un opérateur se souvienne de lancer ce script (l'oubli de cette étape a
 * causé un incident réel : toutes les annonces existantes gelées en USD).
 * Gardé uniquement comme filet de secours manuel si besoin de le relancer
 * explicitement (ex: diagnostic, environnement où runOnceMigration aurait
 * échoué silencieusement).
 *
 * Ne cible QUE currency==="USD" (pas "tout non-null") — un partenaire ayant
 * déjà fait un choix réel via la nouvelle fonctionnalité (ex: EUR) ne doit
 * jamais être annulé par ce script, seule l'ancienne valeur par défaut de
 * schéma (jamais un vrai choix) doit être réinitialisée.
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
  const count = await Vehicle.countDocuments({ currency: "USD" });
  if (dryRun) return { total: count, updated: 0 };

  const result = await Vehicle.updateMany({ currency: "USD" }, { $set: { currency: null } });
  return { total: count, updated: result.modifiedCount };
}

async function run() {
  const EXECUTE = process.argv.includes("--execute");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connecté à MongoDB.", EXECUTE ? "MODE EXÉCUTION RÉELLE" : "MODE DRY-RUN (aucune écriture)");

  const report = await resetVehicleCurrency({ dryRun: !EXECUTE });
  console.log(`\n${EXECUTE ? "── EXÉCUTION" : "── DRY-RUN"} — Vehicle.currency "USD" → null ──`);
  console.log(`Annonces avec currency==="USD" trouvées : ${report.total}`);
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
