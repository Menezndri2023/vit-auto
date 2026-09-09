/**
 * Aligne les taux de commission sur la grille décidée.
 *
 * GRILLE : location 15 %, essai et vente 3 %, export 3 %, chauffeur 15 %.
 * `essai` est facturé au taux `vente` (voir pricingEngine.BOOKING_TYPE_TO_PRICING_TYPE),
 * et l'export au taux `import_export` — 3 % se situe dans la fourchette 3-5 %
 * retenue.
 *
 * SURTOUT : le palier « premium » est aligné sur le standard. Ces taux sont
 * DÉJÀ les taux réduits consentis aux partenaires ; un abonnement ne doit donc
 * plus retrancher quoi que ce soit par-dessus. L'abonnement se justifie
 * désormais par ce qu'il APPORTE — mises en avant incluses, classement
 * prioritaire — et non par une remise supplémentaire sur la commission.
 *
 * Le barème Founding Partner n'est PAS touché : il est contractuel, signé pour
 * douze mois, et le modifier reviendrait à changer un accord unilatéralement.
 *
 * Idempotent. Simulation par défaut.
 * Usage : node server/scripts/setCommissionRates.mjs [--apply]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import PricingConfig from "../models/PricingConfig.js";

const GRILLE = {
  location:      0.15,
  vente:         0.03,   // couvre aussi les demandes d'essai
  import_export: 0.03,   // export
  chauffeur:     0.15,
  leasing:       0.05,   // inchangé, hors périmètre de la décision
};

const pct = (v) => `${(v * 100).toFixed(2).replace(/\.00$/, "")} %`;

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log(apply ? "MODE RÉEL\n" : "SIMULATION (ajouter --apply pour écrire)\n");

  const config = await PricingConfig.findOne({ key: "global" });
  if (!config) throw new Error("PricingConfig « global » introuvable — lancer d'abord la migration de tarification.");

  const avant = JSON.parse(JSON.stringify(config.commissions || {}));
  console.log("Type          | standard avant → après | premium avant → après");
  for (const [type, cible] of Object.entries(GRILLE)) {
    const s = avant.standard?.[type];
    const p = avant.premium?.[type];
    const chg = (v) => (v === cible ? "inchangé" : `${pct(v ?? 0)} → ${pct(cible)}`);
    console.log(`${type.padEnd(13)} | ${chg(s).padEnd(22)} | ${chg(p)}`);
  }

  if (!apply) { console.log("\nAucune écriture (simulation)."); await mongoose.disconnect(); return; }

  // Les deux paliers reçoivent la MÊME grille : c'est la décision, pas un
  // oubli. Le mécanisme premium reste en place (resolveCommissionRate le lit
  // toujours) et pourra reprendre du sens si un jour une remise est décidée.
  config.commissions = { standard: { ...GRILLE }, premium: { ...GRILLE } };
  config.markModified("commissions");
  await config.save();

  console.log("\nGrille appliquée. Le barème Founding Partner reste inchangé (contractuel).");
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
