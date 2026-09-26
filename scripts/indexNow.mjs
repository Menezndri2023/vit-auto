#!/usr/bin/env node
/**
 * Signale nos pages à Bing et Yandex via IndexNow.
 *
 * Pourquoi ce script existe : Google exige une propriété Search Console —
 * compte Google + enregistrement DNS — que seul l'exploitant peut créer, et
 * son Indexing API ne couvre que les offres d'emploi et les événements
 * diffusés, pas un catalogue. IndexNow, lui, ne demande AUCUN compte : un
 * fichier clé hébergé sur le domaine suffit à prouver qu'on le contrôle.
 *
 * La liste des URL vient du sitemap de production, pas d'une liste écrite à la
 * main : deux sources divergeraient, et c'est le sitemap qui fait foi.
 *
 *   node scripts/indexNow.mjs            # soumet tout le sitemap
 *   node scripts/indexNow.mjs --dry-run  # montre ce qui serait soumis
 *   node scripts/indexNow.mjs /faq /plans  # seulement ces chemins
 *
 * ⚠️ Le fichier clé doit être EN LIGNE avant toute soumission : IndexNow le
 * lit pour vérifier la propriété, et répond 403 s'il ne le trouve pas. Après
 * un changement de clé, déployer d'abord, soumettre ensuite.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOTE = "vit-auto.com";
const SITEMAP = "https://vit-auto.com/sitemap.xml";
// L'origine sert le sitemap sans passer par le CDN : utile quand une copie
// périmée traîne encore, et quand la protection anti-bot de Vercel a pris
// l'adresse appelante pour un robot (voir feedback du 2026-09-26).
const ORIGINE = "https://vit-auto-api.onrender.com/sitemap.xml";
const POINT_DE_SOUMISSION = "https://api.indexnow.org/IndexNow";

/** La clé est le nom du fichier .txt de 32 caractères hexadécimaux dans public/. */
export function trouverCle(dossier = join(RACINE, "public")) {
  const fichiers = readdirSync(dossier).filter((f) => /^[0-9a-f]{8,128}\.txt$/.test(f));
  if (fichiers.length === 0) throw new Error("aucun fichier clé IndexNow dans public/");
  if (fichiers.length > 1) throw new Error(`${fichiers.length} fichiers clés dans public/ — il n'en faut qu'un : ${fichiers.join(", ")}`);
  const cle = fichiers[0].replace(/\.txt$/, "");
  const contenu = readFileSync(join(dossier, fichiers[0]), "utf8").trim();
  // Le nom du fichier et son contenu doivent coïncider, sinon la vérification
  // échoue en silence et rien n'est jamais indexé.
  if (contenu !== cle) throw new Error(`le fichier ${fichiers[0]} contient « ${contenu} » au lieu de « ${cle} »`);
  return cle;
}

async function lireSitemap() {
  for (const source of [SITEMAP, ORIGINE]) {
    try {
      const r = await fetch(source, { headers: { "User-Agent": "vit-auto-indexnow" } });
      if (!r.ok) { console.warn(`  ${source} → HTTP ${r.status}, on essaie la suivante`); continue; }
      const xml = await r.text();
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      if (urls.length) { console.log(`  ${urls.length} URL lues depuis ${source}`); return urls; }
    } catch (e) { console.warn(`  ${source} → ${e.message}`); }
  }
  throw new Error("sitemap illisible depuis les deux sources");
}

async function principal() {
  const args = process.argv.slice(2);
  const simulation = args.includes("--dry-run");
  const chemins = args.filter((a) => a.startsWith("/"));

  const key = trouverCle();
  console.log(`clé IndexNow : ${key}`);
  console.log(`vérifiable sur https://${HOTE}/${key}.txt`);

  const urlList = chemins.length
    ? chemins.map((c) => `https://${HOTE}${c}`)
    : await lireSitemap();

  if (simulation) {
    console.log(`\n(simulation) ${urlList.length} URL seraient soumises, par exemple :`);
    urlList.slice(0, 5).forEach((u) => console.log("   ·", u));
    return;
  }

  // IndexNow accepte jusqu'à 10 000 URL par requête ; on découpe par sécurité.
  const LOT = 5000;
  for (let i = 0; i < urlList.length; i += LOT) {
    const lot = urlList.slice(i, i + LOT);
    const r = await fetch(POINT_DE_SOUMISSION, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOTE, key, keyLocation: `https://${HOTE}/${key}.txt`, urlList: lot }),
    });
    const corps = await r.text().catch(() => "");
    // 200 = accepté, 202 = accepté, clé en cours de vérification.
    const ok = r.status === 200 || r.status === 202;
    console.log(`${ok ? "✓" : "✗"} lot ${i / LOT + 1} : ${lot.length} URL → HTTP ${r.status}${corps ? " " + corps.slice(0, 200) : ""}`);
    if (!ok) {
      if (r.status === 403) console.error("  403 = clé introuvable ou non conforme. Le fichier est-il DÉPLOYÉ ?");
      if (r.status === 422) console.error("  422 = une URL ne relève pas du domaine déclaré.");
      if (r.status === 429) console.error("  429 = trop de soumissions. IndexNow n'accélère rien : espacez.");
      process.exitCode = 1;
    }
  }
}

// Importé par le test, exécuté en ligne de commande.
if (process.argv[1] && process.argv[1].endsWith("indexNow.mjs")) {
  principal().catch((e) => { console.error("✗", e.message); process.exit(1); });
}
