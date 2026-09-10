/**
 * Rapatrie sur ImageKit les photos de référence Wikimedia des annonces véhicule,
 * et enregistre le crédit (auteur + licence) de chaque fichier.
 *
 * POURQUOI : plus de 370 annonces appellent directement `upload.wikimedia.org`.
 * Wikimedia limite ce hotlink par IP et le décourage explicitement — un pic de
 * trafic, et le catalogue se vide de ses images sans la moindre erreur côté
 * serveur. Ces URL ne sont pas non plus des URL de production : leur forme
 * (`/thumb/…/1280px-…`) n'est pas contractuelle et peut changer.
 *
 * ATTRIBUTION : 171 des 192 fichiers sont sous CC BY ou CC BY-SA, qui exigent
 * le nom de l'auteur. Tant que l'image était appelée chez Wikimedia, la page du
 * fichier restait accessible ; en devenant hébergeur, nous devons porter le
 * crédit nous-mêmes. Chaque téléversement écrit donc un MediaCredit — sans quoi
 * cette migration aggraverait le problème qu'elle prétend corriger.
 *
 * DÉDUPLICATION : 911 occurrences, 206 URL distinctes, 192 fichiers Commons.
 * Un fichier n'est téléversé qu'une fois, quel que soit le nombre d'annonces.
 *
 * Idempotent : un fichier déjà présent dans MediaCredit n'est pas re-téléversé,
 * et une seconde exécution ne trouve plus aucune URL Wikimedia à réécrire.
 *
 * Usage :
 *   node scripts/migrateVehiclePhotosToImageKit.mjs            → simulation
 *   node scripts/migrateVehiclePhotosToImageKit.mjs --apply    → exécution
 *   … --limit=20   n'traite que 20 fichiers (rodage sur un échantillon)
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import Vehicle from "../models/Vehicle.js";
import MediaCredit from "../models/MediaCredit.js";
import { uploadImage, isImageKitConfigured, FOLDERS } from "../config/imagekit.js";

const APPLY = process.argv.includes("--apply");
const LIMITE = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || Infinity;
const DOSSIER = `${FOLDERS.vehicles}/reference`;
const UA = "VITAUTO/1.0 (https://vit-auto.com; contact@vit-auto.com)";

const estWikimedia = (u) => typeof u === "string" && u.includes("wikimedia.org");

// Nom canonique du fichier Commons. Une URL de vignette porte le nom DEUX fois :
//   /commons/thumb/a/a4/FICHIER.jpg/1280px-FICHIER.jpg
// c'est l'avant-dernier segment qui fait foi. Une URL d'original ne le porte
// qu'une fois, en dernier segment. Confondre les deux enverrait « 1280px-… »
// comme nom de fichier à l'API Commons, qui ne le connaît pas.
const nomCommons = (u) => {
  const seg = u.split("?")[0].split("/");
  return decodeURIComponent(u.includes("/thumb/") ? seg[seg.length - 2] : seg[seg.length - 1]);
};

// Nom de fichier sûr côté ImageKit : le nom Commons contient parenthèses,
// virgules, tirets cadratins et caractères non latins.
const nomSur = (n) => n.replace(/\.[a-z]+$/i, "").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 80).replace(/^_+|_+$/g, "") || "ref";

const nettoie = (h) => (h ? String(h).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : null);

async function metadonnees(fichiers) {
  const meta = {};
  for (let i = 0; i < fichiers.length; i += 50) {
    const lot = fichiers.slice(i, i + 50);
    const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
      + "&iiprop=extmetadata|url&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|License"
      + "&titles=" + lot.map((f) => encodeURIComponent("File:" + f)).join("|");
    const d = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
    for (const p of Object.values(d.query?.pages || {})) {
      const nom = p.title?.replace(/^File:/, "").replace(/ /g, "_");
      const e = p.imageinfo?.[0]?.extmetadata || {};
      const code = nettoie(e.License?.value) || "";
      meta[nom] = {
        auteur:     nettoie(e.Artist?.value),
        licence:    nettoie(e.LicenseShortName?.value),
        licenceUrl: nettoie(e.LicenseUrl?.value),
        // Seuls CC0 et le domaine public dispensent de citer l'auteur.
        attribution: !/^(cc0|pd|public)/i.test(code),
        filePage: p.title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}` : null,
        introuvable: p.missing !== undefined,
      };
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  return meta;
}

async function main() {
  // Sans identifiants, uploadImage renvoie null en silence : la migration
  // paraîtrait n'avoir rien trouvé à faire au lieu d'échouer.
  if (!isImageKitConfigured()) {
    throw new Error("ImageKit non configuré (IMAGEKIT_PUBLIC_KEY/PRIVATE_KEY/URL_ENDPOINT) — migration impossible.");
  }
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log(APPLY ? "\n⚡ MODE RÉEL\n" : "\n🔍 SIMULATION — ajouter --apply pour écrire\n");

  const veh = await Vehicle.find({ $or: [{ images: /wikimedia/ }, { thumbnail: /wikimedia/ }] })
    .select("images thumbnail title status").lean();

  const urls = new Set();
  let occurrences = 0;
  for (const v of veh) {
    for (const u of v.images || []) if (estWikimedia(u)) { urls.add(u); occurrences++; }
    if (estWikimedia(v.thumbnail)) { urls.add(v.thumbnail); occurrences++; }
  }
  const parUrl = Object.fromEntries([...urls].map((u) => [u, nomCommons(u)]));
  const fichiers = [...new Set(Object.values(parUrl))].slice(0, LIMITE);

  console.log(`annonces concernées ..... ${veh.length}`);
  console.log(`occurrences d'images .... ${occurrences}`);
  console.log(`URL distinctes .......... ${urls.size}`);
  console.log(`fichiers Commons uniques  ${[...new Set(Object.values(parUrl))].length}${LIMITE < Infinity ? ` (limité à ${fichiers.length})` : ""}`);

  // Reprise : ce qui a déjà été téléversé lors d'une exécution précédente.
  const dejaFait = new Map(
    (await MediaCredit.find({ sourceName: "Wikimedia Commons" }).select("hostedUrl sourceUrl").lean())
      .map((c) => [c.sourceUrl, c.hostedUrl])
  );
  const aFaire = fichiers.filter((f) => ![...dejaFait.keys()].some((s) => s === f));
  console.log(`déjà migrés ............. ${dejaFait.size}`);
  console.log(`à téléverser ............ ${aFaire.length}\n`);

  if (!aFaire.length && dejaFait.size) console.log("Rien de neuf à téléverser — passage direct à la réécriture.\n");

  console.log("Récupération des licences depuis Commons…");
  const meta = aFaire.length ? await metadonnees(aFaire) : {};
  const sansMeta = aFaire.filter((f) => !meta[f] || meta[f].introuvable);
  if (sansMeta.length) {
    console.log(`\n⛔ ${sansMeta.length} fichier(s) sans métadonnées — ils ne seront PAS migrés :`);
    sansMeta.slice(0, 10).forEach((f) => console.log(`   ${f}`));
  }

  const migrables = aFaire.filter((f) => meta[f] && !meta[f].introuvable && meta[f].auteur);
  console.log(`\n${migrables.length} fichier(s) prêts (auteur et licence connus).`);

  if (!APPLY) {
    console.log("\n── échantillon de ce qui serait fait ──");
    migrables.slice(0, 5).forEach((f) => {
      const m = meta[f];
      console.log(`   ${f.slice(0, 62)}`);
      console.log(`      ${m.licence} · ${m.auteur?.slice(0, 60)} · attribution ${m.attribution ? "requise" : "non requise"}`);
    });
    console.log(`\n══ Simulation : ${migrables.length} téléversements, ${occurrences} références à réécrire sur ${veh.length} annonces.`);
    await mongoose.disconnect();
    return;
  }

  // ── Téléversement, un fichier à la fois ───────────────────────────────────
  // Séquentiel et espacé : ImageKit va CHERCHER le fichier chez Wikimedia, qui
  // limite par IP. En parallèle, une partie des téléversements reviendrait vide.
  const carte = new Map(dejaFait); // nom Commons → URL ImageKit
  let ok = 0, echecs = 0;
  for (const [i, f] of migrables.entries()) {
    // Toujours téléverser depuis l'ORIGINAL, jamais depuis une vignette : les
    // URL en base pointent parfois vers du 500px, et on figerait cette qualité.
    const src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=1280`;
    const r = await uploadImage(src, {
      folder: DOSSIER,
      fileName: `${nomSur(f)}.jpg`,
      tags: ["reference", "wikimedia"],
    });
    if (!r?.url) {
      echecs++;
      console.log(`   ✗ ${f.slice(0, 60)}`);
    } else {
      const m = meta[f];
      await MediaCredit.updateOne(
        { hostedUrl: r.url },
        { $set: {
          hostedUrl: r.url, sourceUrl: f, sourceName: "Wikimedia Commons",
          filePage: m.filePage, author: m.auteur, licence: m.licence,
          licenceUrl: m.licenceUrl, attributionRequired: m.attribution,
        } },
        { upsert: true }
      );
      carte.set(f, r.url);
      ok++;
      if ((i + 1) % 20 === 0) console.log(`   … ${i + 1}/${migrables.length}`);
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  console.log(`\ntéléversés : ${ok}   échecs : ${echecs}\n`);

  // ── Réécriture des références ─────────────────────────────────────────────
  // Une URL dont le fichier n'a pas pu être téléversé est LAISSÉE TELLE QUELLE :
  // mieux vaut un lien Wikimedia qui fonctionne encore qu'une annonce sans photo.
  let annoncesModifiees = 0, refsReecrites = 0, refsLaissees = 0;
  for (const v of veh) {
    const images = (v.images || []).map((u) => {
      if (!estWikimedia(u)) return u;
      const n = carte.get(nomCommons(u));
      if (n) { refsReecrites++; return n; }
      refsLaissees++; return u;
    });
    let thumbnail = v.thumbnail;
    if (estWikimedia(thumbnail)) {
      const n = carte.get(nomCommons(thumbnail));
      if (n) { thumbnail = n; refsReecrites++; } else refsLaissees++;
    }
    const change = images.some((u, i) => u !== (v.images || [])[i]) || thumbnail !== v.thumbnail;
    if (change) {
      await Vehicle.updateOne({ _id: v._id }, { $set: { images, thumbnail } });
      annoncesModifiees++;
    }
  }

  const restantes = await Vehicle.countDocuments({ $or: [{ images: /wikimedia/ }, { thumbnail: /wikimedia/ }] });
  console.log(`annonces modifiées ...... ${annoncesModifiees}`);
  console.log(`références réécrites .... ${refsReecrites}`);
  console.log(`références laissées ..... ${refsLaissees}`);
  console.log(`annonces encore en hotlink ${restantes}`);
  console.log(`crédits enregistrés ..... ${await MediaCredit.countDocuments()}`);

  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
