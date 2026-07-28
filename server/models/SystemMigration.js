import mongoose from "mongoose";

// Marqueur minimal pour des migrations à usage unique exécutées automatiquement
// au démarrage du serveur (voir server.js) — évite de dépendre d'un script
// manuel que l'opérateur doit se souvenir de lancer en production (source
// réelle d'incidents, voir migrate-vehicle-currency-reset.mjs). Chaque
// migration ne s'exécute qu'une seule fois, jamais rejouée ensuite.
const systemMigrationSchema = new mongoose.Schema({
  name:  { type: String, required: true, unique: true },
  ranAt: { type: Date, default: Date.now },
});

const SystemMigration =
  mongoose.models.SystemMigration || mongoose.model("SystemMigration", systemMigrationSchema);

export default SystemMigration;
