/**
 * Script : supprime l'ancien index unique Invoice { partner, year, month }
 * Usage  : cd server && node scripts/migrateInvoiceBusinessIndex.js
 *
 * Contexte : Invoice porte désormais un champ `businessId` (voir
 * models/Invoice.js) et le nouvel index unique est
 * { partner, businessId, year, month } — un partenaire multi-entités reçoit
 * une facture PAR ENTITÉ et par mois au lieu d'une seule facture globale.
 * L'ANCIEN index unique { partner, year, month } n'est jamais supprimé
 * automatiquement par Mongoose (autoIndex ajoute le nouvel index mais ne
 * retire jamais un ancien index qui n'est plus déclaré dans le schéma) — tant
 * qu'il reste en place, il bloque la création d'une 2e facture pour un même
 * partenaire/mois dès qu'une entité distincte est facturée séparément
 * (409 "Une facture existe déjà" alors que ce n'est pas le cas).
 *
 * Aucune donnée n'est modifiée : les factures existantes gardent
 * businessId=null (comportement identique à avant — une facture par
 * partenaire/mois pour qui n'utilise pas le multi-entité). Idempotent —
 * sans effet si l'ancien index est déjà absent.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

export async function dropLegacyInvoiceIndex() {
  try {
    await mongoose.connection.db.collection("invoices").dropIndex("partner_1_year_1_month_1");
    return { dropped: true };
  } catch (err) {
    if (err.codeName === "IndexNotFound" || err.code === 27) {
      return { dropped: false, reason: "already_absent" };
    }
    throw err;
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connecté à MongoDB.");

  const result = await dropLegacyInvoiceIndex();
  console.log(result.dropped
    ? "✅ Ancien index unique partner_1_year_1_month_1 supprimé."
    : "ℹ️  Index déjà absent (rien à faire).");

  const { default: Invoice } = await import("../models/Invoice.js");
  await Invoice.syncIndexes();
  console.log("✅ Index à jour (partner_1_businessId_1_year_1_month_1 garanti présent).");

  await mongoose.disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error("Erreur de migration:", err);
    process.exit(1);
  });
}
