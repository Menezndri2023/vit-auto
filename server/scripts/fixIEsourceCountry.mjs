/**
 * Corrige le pays d'origine des annonces Import/Export.
 *
 * POURQUOI : `sourceCountry` avait été rempli avec le pays de la MARQUE et non
 * le pays d'expédition — Toyota → Japon, Buick/Tesla → États-Unis, Volvo →
 * Suède, Škoda → Rép. tchèque. Or les 211 annonces appartiennent à un seul
 * partenaire dont le compte est en Chine, et les modèles concernés ne sont
 * vendus QUE sur le marché chinois (Toyota Wildlander, Toyota Crown Kluger,
 * Buick GL8, Chevrolet Monza, RAV4 « Rongfang »), avec des finitions chinoises.
 *
 * Ce n'est pas un détail de référencement : un acheteur cliquant « importer
 * depuis le Japon » recevrait une voiture du marché chinois, expédiée de Chine,
 * avec d'autres spécifications et une autre garantie. La marque reste portée
 * par `make` — rien n'est perdu.
 *
 * Le pays retenu est celui du COMPTE partenaire, jamais une valeur devinée :
 * si le compte n'a pas de pays exploitable, l'annonce est laissée telle quelle
 * et signalée.
 *
 * Idempotent. Simulation par défaut.
 * Usage : node server/scripts/fixIEsourceCountry.mjs [--apply]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import ImportExportListing from "../models/ImportExportListing.js";
import User from "../models/User.js";
import { COUNTRY_CODE_TO_NAME } from "../utils/countries.js";

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log(apply ? "MODE RÉEL\n" : "SIMULATION (ajouter --apply pour écrire)\n");

  const partenaires = await ImportExportListing.distinct("partner");
  let total = 0, corrigees = 0, ignorees = 0;

  for (const id of partenaires) {
    const u = await User.findById(id).select("email country").lean();
    const paysReel = COUNTRY_CODE_TO_NAME[String(u?.country || "").toUpperCase()];
    if (!paysReel) {
      const n = await ImportExportListing.countDocuments({ partner: id });
      console.log(`⚠️  ${u?.email || id} : pays du compte inexploitable (${u?.country || "aucun"}) — ${n} annonce(s) laissée(s) telles quelles`);
      ignorees += n;
      continue;
    }

    const aCorriger = await ImportExportListing.find({ partner: id, sourceCountry: { $ne: paysReel } })
      .select("sourceCountry").lean();
    total += aCorriger.length;
    if (!aCorriger.length) continue;

    const repartition = aCorriger.reduce((acc, l) => {
      acc[l.sourceCountry || "(vide)"] = (acc[l.sourceCountry || "(vide)"] || 0) + 1;
      return acc;
    }, {});
    console.log(`${u.email} → « ${paysReel} » : ${aCorriger.length} annonce(s)`);
    for (const [avant, n] of Object.entries(repartition)) console.log(`     ${String(n).padStart(4)} depuis « ${avant} »`);

    if (apply) {
      const r = await ImportExportListing.updateMany(
        { partner: id, sourceCountry: { $ne: paysReel } },
        { $set: { sourceCountry: paysReel } }
      );
      corrigees += r.modifiedCount;
    }
  }

  console.log(apply
    ? `\n${corrigees} annonce(s) corrigée(s).${ignorees ? ` ${ignorees} laissée(s) sans pays exploitable.` : ""}`
    : `\n${total} annonce(s) seraient corrigées.${ignorees ? ` ${ignorees} laissée(s) sans pays exploitable.` : ""}`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
