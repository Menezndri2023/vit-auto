/**
 * Diagnostic de la production — LECTURE SEULE.
 *
 *   cd server && node scripts/diagnosticProduction.mjs
 *
 * Affiche les vérifications de la veille de maintenance (utils/
 * maintenanceWatchdog.js) — les mêmes que l'onglet « Santé système » du
 * panneau d'administration et le digest quotidien — plus les dernières
 * publications refusées. Utile quand l'admin est inaccessible, ou pour
 * vérifier une hypothèse avant de toucher au code.
 *
 * N'écrit RIEN : aucune requête de modification n'est émise. Se connecte à la
 * base désignée par MONGO_URI (server/.env) — celle de PRODUCTION sur le poste
 * de l'exploitant.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { calculerEtatMaintenance, ACTION_REFUS_PUBLICATION } from "../utils/maintenanceWatchdog.js";
import AuditLog from "../models/AuditLog.js";

const uri = process.env.MONGO_URI;
if (!uri) { console.error("MONGO_URI absent (server/.env)."); process.exit(1); }
await mongoose.connect(uri);
const hote = (uri.match(/@([^/?]+)/) || [])[1] || "?";
console.log(`\nDiagnostic — base ${hote} — ${new Date().toISOString()}\n`);

const ICONE = { ok: "✅", attention: "🟠", critique: "🔴" };
const checks = await calculerEtatMaintenance(new Date());
for (const c of checks) {
  console.log(`${ICONE[c.niveau] || "•"} ${c.titre} : ${c.valeur}${c.detail ? `\n     ${c.detail}` : ""}`);
}

const refus = await AuditLog.find({ action: ACTION_REFUS_PUBLICATION, createdAt: { $gte: new Date(Date.now() - 7 * 864e5) } })
  .select("userEmail resource errorMessage createdAt").sort({ createdAt: -1 }).limit(20).lean();
console.log(`\nPublications refusées (7 jours) : ${refus.length}`);
for (const r of refus) console.log(`  ${r.createdAt.toISOString().slice(0, 16)}  ${r.userEmail || "?"}  ${r.resource}  ${r.errorMessage || ""}`);

const nonOk = checks.filter((c) => c.niveau !== "ok").length;
console.log(`\n${nonOk ? `${nonOk} point(s) demandent une action.` : "Rien à signaler."}\n`);
await mongoose.disconnect();
