/**
 * Envoie une relance VIT AUTO aux partenaires dont le dossier ou les annonces
 * sont incomplets : documents manquants, accord non signé, annonces sans tarif.
 *
 * Réutilise exactement le mécanisme quotidien (utils/partnerReminders.js) — même
 * contenu, mêmes garde-fous. Écrire une seconde logique d'envoi aurait produit
 * deux messages différents pour le même besoin, et deux compteurs anti-spam à
 * tenir.
 *
 * GARDE-FOUS hérités : 7 jours minimum entre deux relances du même dossier, et
 * les dossiers modifiés il y a moins de 3 jours sont ignorés — un partenaire
 * qui vient de déposer ses pièces ne doit pas être relancé le lendemain.
 *
 * Usage : node server/scripts/relancePartenaires.mjs [--apply]
 * Sans --apply, affiche qui serait relancé sans rien envoyer.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { checkAndSendPartnerReminders, missingVerificationDocs } from "../utils/partnerReminders.js";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const du = (d) => (!d || Date.now() - new Date(d).getTime() > COOLDOWN_MS);

async function apercu() {
  console.log("── Documents de vérification incomplets ──");
  for (const v of await PartnerVerification.find({ status: { $ne: "verifie" } }).select("userId companyName documents lastReminderSentAt").lean()) {
    const manque = missingVerificationDocs(v);
    if (!manque.length) continue;
    const u = await User.findById(v.userId).select("email").lean();
    console.log(`   ${du(v.lastReminderSentAt) ? "→" : "⏸"} ${u?.email || v.userId} : ${manque.join(", ")}`);
  }

  console.log("\n── Accords en attente de signature ──");
  for (const o of await PartnerOnboarding.find({ status: { $in: ["loi_envoyee", "accord_envoye", "brouillon"] } }).select("userId status lastReminderSentAt").lean()) {
    const u = await User.findById(o.userId).select("email").lean();
    console.log(`   ${du(o.lastReminderSentAt) ? "→" : "⏸"} ${u?.email || o.userId} : ${o.status}`);
  }

  console.log("\n── Annonces sans tarif ──");
  const grp = await Vehicle.aggregate([
    { $match: { status: { $in: ["draft", "pending"] }, $or: [
      { type: "location", $or: [{ pricePerDay: null }, { pricePerDay: 0 }, { pricePerDay: { $exists: false } }] },
      { type: "vente",    $or: [{ priceForSale: null }, { priceForSale: 0 }, { priceForSale: { $exists: false } }] },
    ] } },
    { $group: { _id: "$owner", n: { $sum: 1 } } },
  ]);
  for (const g of grp) {
    const u = await User.findById(g._id).select("email lastListingReminderAt").lean();
    console.log(`   ${du(u?.lastListingReminderAt) ? "→" : "⏸"} ${u?.email || g._id} : ${g.n} annonce(s)`);
  }
  console.log("\n(→ serait relancé · ⏸ relancé il y a moins de 7 jours)");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log(apply ? "MODE RÉEL — envoi des relances\n" : "SIMULATION (ajouter --apply pour envoyer)\n");

  await apercu();

  if (apply) {
    const n = await checkAndSendPartnerReminders();
    console.log(`\n${n} relance(s) envoyée(s).`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
