/**
 * Sort les images des annonces Import/Export du document MongoDB vers ImageKit.
 *
 * POURQUOI : `mainPhoto` est stocké en base64 DANS le document (334 Ko en
 * moyenne, 211 annonces, 68,9 Mo). La vue liste l'affiche, elle ne peut donc
 * pas l'exclure : une page de 20 annonces transférait ~6,9 Mo depuis Atlas et
 * dépassait le délai maximum de Render — la route publique renvoyait 500 et le
 * catalogue Import/Export était inaccessible. Mesuré : la même requête sans
 * `mainPhoto` passe de 74 500 ms à 778 ms.
 *
 * `photos` (le carrousel du détail, 441 Mo au total) est traité seulement avec
 * --with-photos : il ne provoque pas la panne, et représente à lui seul six
 * fois plus de données à téléverser.
 *
 * Idempotent : une URL déjà migrée est ignorée. Simulation par défaut. Les
 * originaux sont écrits sur disque avant toute réécriture (--sauvegarde=chemin).
 *
 * ÉTAT : exécuté avec --with-photos le 2026-09-11 — 210 annonces, 1252 photos,
 * 369 Mo sortis de la base (372 Mo → 0,7 Mo). Il ne reste rien à migrer, et les
 * créations/modifications téléversent déjà vers ImageKit (voir createListing) :
 * ce script est conservé pour un éventuel rattrapage, pas pour un usage courant.
 *
 * Usage : node server/scripts/migrateIEPhotosToImageKit.mjs [--apply] [--with-photos] [--sauvegarde=fichier.jsonl]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import ImportExportListing from "../models/ImportExportListing.js";
import { uploadBase64Images, isImageKitConfigured, FOLDERS } from "../config/imagekit.js";

const estBase64 = (v) => typeof v === "string" && v.startsWith("data:");
const ko = (v) => (typeof v === "string" ? Math.round(v.length / 1024) : 0);

async function main() {
  const apply = process.argv.includes("--apply");
  const avecPhotos = process.argv.includes("--with-photos");

// Sauvegarde des originaux AVANT réécriture. Une migration base64 → URL est à
// sens unique : le document réécrit ne contient plus l'image, et ces photos
// sont celles des partenaires, pas les nôtres. Une ligne JSON par annonce,
// écrite et vidée sur le disque avant l'écriture en base : si le processus
// s'arrête entre les deux, l'original est déjà à l'abri.
// (Ajouté après la migration du 2026-09-11, qui a sorti 369 Mo de la base :
// une reprise, même improbable, doit pouvoir tout replacer.)
const SAUVEGARDE = process.argv.find((a) => a.startsWith("--sauvegarde="))?.split("=")[1]
  || join(__dirname, `../../sauvegarde-photos-ie-${new Date().toISOString().slice(0, 10)}.jsonl`);
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  // Sans identifiants, uploadBase64Images renvoie l'entrée INCHANGÉE : la
  // migration semblerait réussir sans rien convertir. On refuse d'avancer.
  if (!isImageKitConfigured()) {
    throw new Error("ImageKit non configuré (IMAGEKIT_PUBLIC_KEY/PRIVATE_KEY/URL_ENDPOINT) — migration impossible.");
  }

  await mongoose.connect(uri);
  console.log(apply ? "MODE RÉEL\n" : "SIMULATION (ajouter --apply pour écrire)\n");

  // Inventaire calculé DANS MongoDB : `$strLenBytes`/`$substrCP` renvoient un
  // entier et un préfixe par annonce, jamais les images. Charger les documents
  // pour les compter transférerait précisément les 69 Mo que cette migration
  // cherche à faire disparaître — c'est ce que faisait la première version, et
  // la simulation mettait plus de dix minutes.
  const [stats] = await ImportExportListing.aggregate([
    { $project: {
        mainBase64: { $cond: [{ $eq: [{ $substrCP: [{ $ifNull: ["$mainPhoto", ""] }, 0, 5] }, "data:"] }, 1, 0] },
        mainPoids:  { $cond: [{ $eq: [{ $substrCP: [{ $ifNull: ["$mainPhoto", ""] }, 0, 5] }, "data:"] }, { $strLenBytes: { $ifNull: ["$mainPhoto", ""] } }, 0] },
        nbPhotos:   { $size: { $ifNull: ["$photos", []] } },
    } },
    { $group: { _id: null, total: { $sum: 1 }, aMigrer: { $sum: "$mainBase64" }, poids: { $sum: "$mainPoids" }, photos: { $sum: "$nbPhotos" } } },
  ]);

  const aMigrer = stats?.aMigrer || 0;
  console.log(`${stats?.total || 0} annonce(s) — ${aMigrer} vignette(s) en base64, ${((stats?.poids || 0) / 1048576).toFixed(1)} Mo`);
  if (avecPhotos) console.log(`  (+ ${stats?.photos || 0} photo(s) de carrousel, traitées aussi)`);
  if (!aMigrer && !avecPhotos) { console.log("Rien à migrer."); await mongoose.disconnect(); return; }
  if (!apply) { console.log("\nAucune écriture (simulation)."); await mongoose.disconnect(); return; }

  // Traitement UNE ANNONCE À LA FOIS : chaque image est chargée, téléversée,
  // puis relâchée. Charger les 211 d'un coup tiendrait 69 Mo en mémoire (441 Mo
  // avec --with-photos) et rendrait toute reprise après interruption impossible.
  const ids = await ImportExportListing.find({}).select("_id").lean();

  let converties = 0, echecs = 0, docs = 0;
  for (const { _id } of ids) {
    const champs = avecPhotos ? "mainPhoto photos" : "mainPhoto";
    const a = await ImportExportListing.findById(_id).select(champs).lean();
    if (!a) continue;
    const maj = {};

    if (estBase64(a.mainPhoto)) {
      const [url] = await uploadBase64Images([a.mainPhoto], FOLDERS.vehicles);
      // uploadBase64Images renvoie l'entrée telle quelle si l'upload échoue :
      // on ne réécrit QUE si l'URL a réellement changé, sinon on remplacerait
      // une image par elle-même en croyant l'avoir migrée.
      if (url && url !== a.mainPhoto) { maj.mainPhoto = url; converties++; } else { echecs++; }
    }

    if (avecPhotos && Array.isArray(a.photos) && a.photos.some(estBase64)) {
      const urls = await uploadBase64Images(a.photos, FOLDERS.vehicles);
      const change = urls.filter((u, i) => u !== a.photos[i]).length;
      if (change) { maj.photos = urls; converties += change; }
      echecs += a.photos.filter(estBase64).length - change;
    }

    if (Object.keys(maj).length) {
      fs.appendFileSync(SAUVEGARDE, JSON.stringify({ _id: String(_id), mainPhoto: a.mainPhoto, photos: a.photos }) + "\n");
      await ImportExportListing.updateOne({ _id }, { $set: maj });
      docs++;
      if (docs % 20 === 0) console.log(`  … ${docs} annonce(s) migrée(s)`);
    }
  }

  console.log(`\n${converties} image(s) migrée(s) sur ${docs} annonce(s). ${echecs} échec(s) laissé(s) tels quels.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
