/**
 * Script : Migration PartnerOnboarding vers le Founding Partner Program PAR ENTITÉ
 * Usage  : cd server && node scripts/migratePartnerOnboardingToBusinessId.js [--execute]
 *
 * Dry-run par défaut (aucune écriture, aucune création de PartnerBusiness) —
 * ajouter --execute pour appliquer réellement, après avoir vérifié le rapport.
 *
 * Pour chaque dossier PartnerOnboarding sans businessId :
 *   1. Résout (ou crée) la PartnerBusiness par défaut du partenaire, seedée
 *      depuis companyInfo quand disponible (legalName -> companyName,
 *      registrationCountry -> country, address -> adresse), sinon depuis
 *      User.business/User.country (voir ensureDefaultPartnerBusiness.js).
 *   2. Déduit `activity` depuis l'ancien `partnerType` (mapping inverse de
 *      ACTIVITY_TO_PARTNER_TYPE, voir server/constants/partnerTaxonomy.js) ;
 *      si `partnerType` n'a pas d'équivalent (expert_auto/financement/
 *      assurance/inspecteur_vehicles/transitaire_logistique — antérieurs au
 *      modèle à 4 activités), laisse activity=null et le journalise pour
 *      revue manuelle plutôt que de deviner une valeur.
 *
 * Ordre de déploiement recommandé (voir commentaire sur l'index composé dans
 * server/models/PartnerOnboarding.js) :
 *   1. Déployer le schéma (businessId/activity + nouvel index composé).
 *   2. Lancer ce script SANS --execute, vérifier le rapport.
 *   3. Lancer avec --execute.
 *   4. Vérifier countDocuments({ businessId: null }) === 0 (fait automatiquement
 *      en fin de script).
 *   5. dropLegacyUserIdIndex() retire l'ancien index unique userId_1 s'il existe
 *      encore (idempotent, sans effet si déjà absent).
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { ACTIVITY_TO_PARTNER_TYPE } from "../constants/partnerTaxonomy.js";
import { ensureDefaultPartnerBusiness } from "../utils/ensureDefaultPartnerBusiness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

const PARTNER_TYPE_TO_ACTIVITY = Object.fromEntries(
  Object.entries(ACTIVITY_TO_PARTNER_TYPE).map(([activity, partnerType]) => [partnerType, activity])
);

export function reverseActivityFromPartnerType(partnerType) {
  return PARTNER_TYPE_TO_ACTIVITY[partnerType] || null;
}

// Fonction principale exportée — testable indépendamment du CLI (voir
// tests/migratePartnerOnboardingToBusinessId.test.js), suppose une connexion
// Mongoose déjà établie (le CLI se connecte lui-même, voir run() plus bas).
export async function migratePartnerOnboardingRecords({ dryRun = true } = {}) {
  const { default: PartnerOnboarding } = await import("../models/PartnerOnboarding.js");
  const { default: User } = await import("../models/User.js");

  const docs = await PartnerOnboarding.find({ businessId: null });
  const report = { total: docs.length, migrated: 0, ambiguousActivity: [], missingUser: [] };

  for (const doc of docs) {
    const user = await User.findById(doc.userId);
    if (!user) {
      report.missingUser.push(String(doc._id));
      continue;
    }

    const activity = reverseActivityFromPartnerType(doc.partnerType);
    if (!activity) {
      report.ambiguousActivity.push({
        id: String(doc._id),
        referenceNumber: doc.referenceNumber,
        partnerType: doc.partnerType,
      });
    }

    if (dryRun) {
      // Aucune écriture ni création de PartnerBusiness en dry-run — le rapport
      // (total/ambiguousActivity/missingUser) suffit à valider avant --execute.
      report.migrated += 1;
      continue;
    }

    const seed = {
      companyName: doc.companyInfo?.legalName || undefined,
      country:     doc.companyInfo?.registrationCountry || undefined,
      adresse:     doc.companyInfo?.address || undefined,
    };
    const business = await ensureDefaultPartnerBusiness(user, seed);
    doc.businessId = business._id;
    doc.activity = activity;
    await doc.save();
    report.migrated += 1;
  }

  return report;
}

async function dropLegacyUserIdIndex() {
  try {
    await mongoose.connection.db.collection("partneronboardings").dropIndex("userId_1");
    console.log("✅ Ancien index unique userId_1 supprimé.");
  } catch (err) {
    if (err.codeName === "IndexNotFound" || err.code === 27) {
      console.log("ℹ️  Index userId_1 déjà absent (rien à faire).");
    } else {
      console.error("⚠️  Erreur suppression index userId_1 :", err.message);
    }
  }
}

function printReport(report, dryRun) {
  console.log(`\n${dryRun ? "── DRY-RUN " : "── EXÉCUTION "}— PartnerOnboarding → businessId ──`);
  console.log(`Dossiers sans businessId trouvés : ${report.total}`);
  console.log(`${dryRun ? "Seraient migrés" : "Migrés"} : ${report.migrated}`);
  if (report.missingUser.length) {
    console.log(`⚠️  ${report.missingUser.length} dossier(s) sans utilisateur associé (orphelins) :`, report.missingUser);
  }
  if (report.ambiguousActivity.length) {
    console.log(`⚠️  ${report.ambiguousActivity.length} dossier(s) avec un partnerType sans équivalent d'activité (laissés activity=null, à revoir manuellement) :`);
    for (const a of report.ambiguousActivity) {
      console.log(`   - ${a.referenceNumber || a.id} (partnerType: ${a.partnerType})`);
    }
  }
}

async function run() {
  const EXECUTE = process.argv.includes("--execute");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connecté à MongoDB.", EXECUTE ? "MODE EXÉCUTION RÉELLE" : "MODE DRY-RUN (aucune écriture)");

  const report = await migratePartnerOnboardingRecords({ dryRun: !EXECUTE });
  printReport(report, !EXECUTE);

  if (!EXECUTE) {
    console.log("\n── DRY-RUN terminé, aucune écriture effectuée. Relancer avec --execute pour appliquer. ──");
    await mongoose.disconnect();
    return;
  }

  await dropLegacyUserIdIndex();

  const { default: PartnerOnboarding } = await import("../models/PartnerOnboarding.js");
  const remaining = await PartnerOnboarding.countDocuments({ businessId: null });
  console.log(remaining === 0
    ? "\n✅ Migration terminée — plus aucun dossier sans businessId."
    : `\n⚠️  ${remaining} dossier(s) restent sans businessId (voir orphelins ci-dessus) — à corriger manuellement.`);

  await mongoose.disconnect();
}

// N'exécute le CLI que si ce fichier est lancé directement (node
// migratePartnerOnboardingToBusinessId.js) — jamais quand il est importé par
// les tests, qui appellent migratePartnerOnboardingRecords() directement sur
// la connexion Mongoose déjà établie par tests/setup.js.
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error("Erreur de migration:", err);
    process.exit(1);
  });
}
