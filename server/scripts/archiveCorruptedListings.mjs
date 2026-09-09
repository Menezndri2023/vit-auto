/**
 * Retire du catalogue public les annonces manifestement corrompues ou de test.
 * Idempotent : relançable, ne touche qu'aux annonces encore publiées.
 * Simulation par défaut ; ajouter --apply pour écrire réellement.
 *
 * Usage : node server/scripts/archiveCorruptedListings.mjs [--apply]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import Vehicle from "../models/Vehicle.js";

// Prix de vente plancher en dessous duquel une annonce ne peut pas être
// sincère. Aucun véhicule, même une épave, ne se vend 1 000 USD sur cette
// plateforme : en dessous, c'est une erreur de saisie ou de conversion, jamais
// une offre. On ARCHIVE plutôt que de deviner un prix — inventer un montant
// engagerait le partenaire sur une somme qu'il n'a jamais fixée.
const PRIX_VENTE_PLANCHER_USD = 1000;

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log(apply ? "MODE RÉEL\n" : "SIMULATION (ajouter --apply pour écrire)\n");

  const publie = { status: "approved" };

  const corrompus = await Vehicle.find({
    ...publie, type: "vente",
    priceForSale: { $gt: 0, $lt: PRIX_VENTE_PLANCHER_USD },
  }).select("title priceForSale owner").lean();

  // Données de test échappées en production : un catalogue public n'a jamais à
  // montrer une « Test Car ». On cible le titre exact plutôt qu'un motif large,
  // pour ne jamais emporter une vraie annonce dont le titre contiendrait "test".
  const deTest = await Vehicle.find({ ...publie, title: "Test Car" })
    .select("title type owner").lean();

  console.log(`Annonces de vente sous ${PRIX_VENTE_PLANCHER_USD} USD : ${corrompus.length}`);
  corrompus.forEach((v) => console.log(`   ${v.priceForSale} USD — ${v.title} (${v._id})`));
  console.log(`Annonces de test publiées : ${deTest.length}`);
  deTest.forEach((v) => console.log(`   ${v.title} (${v._id})`));

  const ids = [...corrompus, ...deTest].map((v) => v._id);
  if (!ids.length) { console.log("\nRien à archiver."); await mongoose.disconnect(); return; }

  if (!apply) { console.log(`\n${ids.length} annonce(s) seraient archivées.`); await mongoose.disconnect(); return; }

  // "archived" est une transition de cycle de vie, pas un rejet de modération :
  // l'annonce sort du catalogue sans que le partenaire soit accusé d'avoir
  // enfreint une règle, et il peut la corriger puis la republier.
  const res = await Vehicle.updateMany(
    { _id: { $in: ids } },
    {
      $set: { status: "archived", available: false },
      $push: { statusHistory: { status: "archived", changedAt: new Date(), changedBy: null } },
    }
  );
  console.log(`\n${res.modifiedCount} annonce(s) archivée(s).`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
