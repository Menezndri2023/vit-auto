/**
 * Aligne les taux de commission sur la grille décidée.
 *
 * GRILLE UNIQUE (exploitant, 2026-10-27) — une seule colonne, pour tous :
 *   location 10 % · vente et essai 2 % · vente de véhicule à l'export 3 % ·
 *   pièces détachées 5 % (directe comme importée) · chauffeur 10 % ·
 *   activités et loisirs 10 %.
 * Elle remplace la grille à deux colonnes du 2026-09-12 (standard 15/5/5/15/15,
 * fondateur 10/3/3/10/10). Chaque ligne est égale ou inférieure à l'ancien taux
 * fondateur : aucun partenaire ne paie plus qu'avant.
 *
 * La source des taux est config/defaultPricingConfig.js — ce script ne les
 * recopie pas, il écrit ceux-là dans le document PricingConfig de la base
 * (qui l'emporte sur les valeurs par défaut).
 *
 * Le palier « premium » reste aligné sur le standard (l'abonnement ne change
 * rien aux commissions) et la grille fondateur aussi (le mécanisme des douze
 * mois est conservé pour un éventuel tarif fondateur futur). `leasing`, hors du
 * barème, n'est pas touché.
 *
 * Appelé automatiquement au démarrage par la migration
 * « grille-commissions-unique-2026-10-27 » (server.js) ; utilisable à la main.
 * Idempotent. Simulation par défaut.
 * Usage : node server/scripts/setCommissionRates.mjs [--apply]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

import PricingConfig from "../models/PricingConfig.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";

// Les seules clés que le barème du 2026-10-27 fixe.
const CLES_BAREME = ["location", "vente", "import_export", "chauffeur", "activite", "piece", "piece_import"];

const extraire = (grille) => Object.fromEntries(CLES_BAREME.map((k) => [k, grille[k]]));
const GRILLE = extraire(DEFAULT_PRICING_CONFIG.commissions.standard);
const GRILLE_FONDATEUR = extraire(DEFAULT_PRICING_CONFIG.foundingPartner.entreprise);

const pct = (v) => `${(v * 100).toFixed(2).replace(/\.00$/, "")} %`;

/**
 * Écrit la grille dans le document PricingConfig « global » et réaligne les
 * dossiers fondateur. Suppose une connexion Mongoose ouverte. Sans document en
 * base, rien à faire : le moteur lit déjà les valeurs par défaut.
 */
export async function appliquerGrilleUnique({ apply = true, log = () => {} } = {}) {
  const config = await PricingConfig.findOne({ key: "global" });
  if (!config) { log("PricingConfig « global » absent : les valeurs par défaut s'appliquent déjà."); return { modifie: false }; }

  const avant = JSON.parse(JSON.stringify(config.commissions || {}));
  const avantFp = JSON.parse(JSON.stringify(config.foundingPartner || {}));
  const chg = (v, cible) => (v === cible ? "inchangé" : `${v == null ? "aucun" : pct(v)} → ${pct(cible)}`);

  log("Type          | standard               | premium                | fondateur (entreprise)");
  for (const [type, cible] of Object.entries(GRILLE)) {
    log(`${type.padEnd(13)} | ${chg(avant.standard?.[type], cible).padEnd(22)} | ${chg(avant.premium?.[type], cible).padEnd(22)} | ${chg(avantFp.entreprise?.[type], GRILLE_FONDATEUR[type])}`);
  }
  if (!apply) return { modifie: false };

  // Fusion clé par clé : `leasing` et toute autre clé existante sont conservés.
  for (const palier of ["standard", "premium"]) {
    for (const [type, taux] of Object.entries(GRILLE)) config.set(`commissions.${palier}.${type}`, taux);
  }
  for (const entite of ["entreprise", "particulier"]) {
    for (const [type, taux] of Object.entries(GRILLE_FONDATEUR)) config.set(`foundingPartner.${entite}.${type}`, taux);
  }
  await config.save();

  // PartnerOnboarding.commissions stocke des POURCENTAGES entiers (10, 2, 10)
  // — pas des fractions comme PricingConfig. Ce sont les taux qu'affichent la
  // LOI, l'Accord et l'espace fondateur ; le moteur ne les lit pas. On ne
  // réaligne que la valeur de l'ancienne grille (vente 3 %) : un taux saisi à
  // la main pour un dossier particulier n'est pas écrasé. Baisse uniquement —
  // favorable au partenaire.
  const dossiers = await PartnerOnboarding.updateMany(
    { "commissions.vente": 3 },
    { $set: { "commissions.vente": GRILLE_FONDATEUR.vente * 100 } }
  );
  log(`Grille appliquée. ${dossiers.modifiedCount} dossier(s) fondateur réaligné(s) (vente 3 % → ${pct(GRILLE_FONDATEUR.vente)}).`);
  return { modifie: true, dossiers: dossiers.modifiedCount };
}

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: join(__dirname, "../.env") });
  dotenv.config();

  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log(apply ? "MODE RÉEL\n" : "SIMULATION (ajouter --apply pour écrire)\n");
  await appliquerGrilleUnique({ apply, log: console.log });
  if (!apply) console.log("\nAucune écriture (simulation).");
  await mongoose.disconnect();
}

// Exécuté seulement en ligne de commande — importé par server.js, il ne doit
// ni ouvrir de connexion ni quitter le processus.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
