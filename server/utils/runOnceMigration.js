import SystemMigration from "../models/SystemMigration.js";
import logger from "./logger.js";

// Exécute `fn` une seule fois, jamais rejouée aux démarrages suivants (voir
// SystemMigration.js) — remplace un script manuel que l'opérateur doit se
// souvenir de lancer en production après déploiement, source réelle d'un
// incident (Vehicle.currency resté à l'ancienne valeur par défaut "USD" sur
// toutes les annonces existantes, gelant leur affichage en USD pour tout le
// monde au lieu de garder la conversion automatique par pays du visiteur).
// N'enregistre le marqueur qu'en cas de succès — un échec retente au
// prochain démarrage plutôt que de rester silencieusement jamais appliqué.
export async function runOnceMigration(name, fn) {
  const already = await SystemMigration.findOne({ name }).lean();
  if (already) return;
  try {
    await fn();
    await SystemMigration.create({ name });
    logger.info(`[Migration] "${name}" exécutée avec succès.`);
  } catch (err) {
    logger.error(`[Migration] "${name}" a échoué (non bloquant, retentée au prochain démarrage) :`, err.message);
  }
}
