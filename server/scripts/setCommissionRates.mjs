/**
 * Aligne les taux de commission sur la grille décidée.
 *
 * DEUX grilles, et c'est le cœur du modèle :
 *   • FONDATEUR (12 mois à compter de la signature) — location 10 %, essai et
 *     vente 3 %, export 3 %, chauffeur 10 %. C'est ce que paient les
 *     partenaires aujourd'hui.
 *   • STANDARD (au-delà) — location 15 %, essai et vente 5 %, export 5 %,
 *     chauffeur 15 %.
 * `essai` est facturé au taux `vente` (voir pricingEngine.BOOKING_TYPE_TO_PRICING_TYPE),
 * et l'export au taux `import_export` — 3 % se situe dans la fourchette 3-5 %
 * retenue.
 *
 * SURTOUT : le palier « premium » est aligné sur le standard. La faveur
 * commerciale est DÉJÀ accordée par l'offre Founding Partner — ouverte aux
 * partenaires actuels comme futurs, pendant un an. Un abonnement ne doit donc
 * pas retrancher 20 % de plus par-dessus : il se justifie par ce qu'il APPORTE
 * — mises en avant incluses, classement prioritaire — et le plan choisi est
 * accordé dès que le support l'a confirmé.
 *
 * ⚠️ Le barème fondateur s'applique désormais aussi au CHAUFFEUR, et la même
 * grille est posée pour les entités « entreprise » et « particulier ». Le
 * taux export d'un particulier était auparavant absent (retour au standard) :
 * il vaut maintenant 3 % comme les autres.
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
import PartnerOnboarding from "../models/PartnerOnboarding.js";

// Grille STANDARD — celle qui s'applique une fois la fenêtre fondateur écoulée.
const GRILLE = {
  location:      0.15,
  vente:         0.05,   // couvre aussi les demandes d'essai
  import_export: 0.05,   // export
  chauffeur:     0.15,
  leasing:       0.05,   // inchangé, hors périmètre de la décision
};

// Grille FONDATEUR — la faveur commerciale, pendant douze mois à compter de la
// signature de l'accord. C'est elle que paient les partenaires aujourd'hui.
const GRILLE_FONDATEUR = {
  location:      0.10,
  vente:         0.03,   // essai et vente
  import_export: 0.03,   // export
  chauffeur:     0.10,
};

// PartnerOnboarding.commissions stocke des POURCENTAGES entiers (10, 3, 10) —
// pas des fractions comme PricingConfig. Confondre les deux inscrirait « 0,1 % »
// dans un accord.
const GRILLE_DOSSIER = {
  location:  GRILLE_FONDATEUR.location  * 100,
  vente:     GRILLE_FONDATEUR.vente     * 100,
  chauffeur: GRILLE_FONDATEUR.chauffeur * 100,
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
  const avantFp = JSON.parse(JSON.stringify(config.foundingPartner || {}));

  console.log("STANDARD (après 12 mois)");
  console.log("Type          | standard avant → après | premium avant → après");
  for (const [type, cible] of Object.entries(GRILLE)) {
    const chg = (v) => (v === cible ? "inchangé" : `${pct(v ?? 0)} → ${pct(cible)}`);
    console.log(`${type.padEnd(13)} | ${chg(avant.standard?.[type]).padEnd(22)} | ${chg(avant.premium?.[type])}`);
  }

  console.log("\nFONDATEUR (12 mois)");
  for (const [type, cible] of Object.entries(GRILLE_FONDATEUR)) {
    const e = avantFp.entreprise?.[type];
    const p = avantFp.particulier?.[type];
    const chg = (v) => (v === cible ? "inchangé" : `${v == null ? "aucun" : pct(v)} → ${pct(cible)}`);
    console.log(`${type.padEnd(13)} | entreprise ${chg(e).padEnd(20)} | particulier ${chg(p)}`);
  }

  if (!apply) { console.log("\nAucune écriture (simulation)."); await mongoose.disconnect(); return; }

  // Les deux paliers reçoivent la MÊME grille standard : c'est la décision, pas
  // un oubli. L'abonnement n'accorde plus de remise — la faveur passe par
  // l'offre fondateur ci-dessous.
  config.commissions = { standard: { ...GRILLE }, premium: { ...GRILLE } };
  config.foundingPartner = {
    ...config.foundingPartner,
    durationMonths: config.foundingPartner?.durationMonths || 12,
    entreprise:  { ...GRILLE_FONDATEUR },
    particulier: { ...GRILLE_FONDATEUR },
  };
  config.markModified("commissions");
  config.markModified("foundingPartner");
  await config.save();

  // Les taux inscrits dans les dossiers sont ceux qu'affichent la LOI et
  // l'Accord — mais le moteur ne les a JAMAIS lus : il facture depuis la config
  // globale. Un partenaire pouvait donc signer 5 % et payer 10 %. On les
  // réaligne pour que le document dise ce qui est réellement facturé.
  const dossiers = await PartnerOnboarding.updateMany(
    { isFoundingPartner: true },
    { $set: {
        "commissions.location":  GRILLE_DOSSIER.location,
        "commissions.vente":     GRILLE_DOSSIER.vente,
        "commissions.chauffeur": GRILLE_DOSSIER.chauffeur,
    } }
  );

  console.log(`\nGrilles appliquées. ${dossiers.modifiedCount} dossier(s) fondateur réaligné(s) sur les taux réellement facturés.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
