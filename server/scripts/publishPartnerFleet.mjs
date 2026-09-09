/**
 * Publie les véhicules de flotte partenaire restés en brouillon ou en attente.
 *
 * POURQUOI : 228 véhicules réels — ville, prix, photos, contact — dormaient
 * invisibles (`draft`/`pending`) alors que le catalogue public n'en montrait
 * que 137. Ce n'est pas le compteur qu'il fallait gonfler, c'est ce stock qu'il
 * fallait rendre visible.
 *
 * Ne publie QUE les annonces réellement complètes : titre, ville, au moins une
 * photo, et un prix strictement positif. Une annonce sans prix mise en ligne
 * s'affiche sans montant et ne peut pas être réservée — mieux vaut la laisser
 * en attente que la publier cassée. Les 32 annonces sans tarif de la flotte
 * HO RENT (grille tarifaire incomplète, prix jamais devinés) restent donc
 * telles quelles et sont signalées.
 *
 * Idempotent. Simulation par défaut.
 * Usage : node server/scripts/publishPartnerFleet.mjs [--apply] [--owner <email>]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";

async function main() {
  const apply = process.argv.includes("--apply");
  const iEmail = process.argv.indexOf("--owner");
  const email = iEmail > -1 ? process.argv[iEmail + 1] : null;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log(apply ? "MODE RÉEL\n" : "SIMULATION (ajouter --apply pour écrire)\n");

  const base = { status: { $in: ["draft", "pending"] } };
  if (email) {
    const u = await User.findOne({ email }).select("_id").lean();
    if (!u) throw new Error(`Aucun compte pour ${email}`);
    base.owner = u._id;
  }

  // Le prix se lit sur pricePerDay pour une location, priceForSale pour une
  // vente : exiger le mauvais champ écarterait toutes les annonces de l'autre
  // type.
  const complet = {
    ...base,
    title: { $nin: [null, ""] },
    ville: { $nin: [null, ""] },
    "images.0": { $exists: true },
    $or: [
      { type: "location", pricePerDay:  { $gt: 0 } },
      { type: "vente",    priceForSale: { $gt: 0 } },
    ],
  };

  const total = await Vehicle.countDocuments(base);
  const aPublier = await Vehicle.countDocuments(complet);
  console.log(`${total} véhicule(s) en brouillon/attente — ${aPublier} complet(s) et publiable(s), ${total - aPublier} incomplet(s) laissé(s) en l'état`);

  if (total - aPublier > 0) {
    const incomplets = await Vehicle.find({ ...base, _id: { $nin: (await Vehicle.find(complet).select("_id").lean()).map((v) => v._id) } })
      .select("title type pricePerDay priceForSale ville").limit(5).lean();
    console.log("  exemples d'incomplets :");
    incomplets.forEach((v) => console.log(`     ${v.title?.slice(0, 45)} — prix ${v.type === "vente" ? v.priceForSale : v.pricePerDay ?? "absent"}`));
  }

  if (!aPublier) { console.log("\nRien à publier."); await mongoose.disconnect(); return; }
  if (!apply) { console.log("\nAucune écriture (simulation)."); await mongoose.disconnect(); return; }

  // `available: true` autant que `status: "approved"` : le catalogue public
  // exige les deux (voir vehicleController.getVehicles), une annonce approuvée
  // mais indisponible resterait invisible.
  const res = await Vehicle.updateMany(complet, {
    $set: { status: "approved", available: true },
    $push: { statusHistory: { status: "approved", changedAt: new Date(), changedBy: null } },
  });
  console.log(`\n${res.modifiedCount} véhicule(s) publié(s).`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
