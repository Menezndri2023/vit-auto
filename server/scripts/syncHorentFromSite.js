import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { uploadImage, isImageKitConfigured, FOLDERS } from "../config/imagekit.js";
import { getRateFromUSD } from "../services/currencyEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// ALIGNEMENT DU CATALOGUE HO RENT SUR SON SITE OFFICIEL
// ═══════════════════════════════════════════════════════════════════════════
// Les 299 annonces de HO RENT ont été créées par import en masse, puis
// complétées de proche en proche : photos de référence Wikimedia, tarifs
// approchés, villes réparties en rotation. Le site officiel horentcar.com
// publie le parc réel — 50 modèles, avec tarif, boîte, carburant, catégorie et
// le visuel que l'agence emploie elle-même.
//
// Ce script rapproche les deux et n'écrit QUE ce qui est sourcé sur le site.
// Ce qui n'y figure pas (année, kilométrage, nombre de places, montant de la
// caution) n'est pas comblé : les fiches du site ne les donnent pas.
//
// Données relevées le 2026-09-10 sur horentcar.com/fr/parc-auto et
// /fr/condition-general-location-voitures. Le fichier de parc est produit à
// part et passé en argument, pour que la relecture porte sur des données
// figées plutôt que sur un scraping qui rejoue à chaque exécution.
//
//   node scripts/syncHorentFromSite.js <parc.json>            → simulation
//   node scripts/syncHorentFromSite.js <parc.json> --confirm  → écriture

const CONFIRME = process.argv.includes("--confirm");
const FICHIER = process.argv.slice(2).find((a) => a.endsWith(".json"));
const EMAIL = "ho.rentacar@gmail.com";

// Conditions générales, relevées mot pour mot sur leur page de conditions.
const CONDITIONS = {
  ageMinimum: 23,
  ancienneteDuPermisAnnees: 2,
  dureeMinimaleJours: 3,
  politiqueCarburant: "Carburant identique : le véhicule est restitué avec le même niveau qu'au départ.",
  politiqueAnnulation: "Annulation gratuite.",
  assuranceIncluse: true,
  autresExigences:
    "Caution bloquée sur la carte bancaire, libérée après restitution du véhicule. "
    + "La carte doit être au nom du conducteur (VISA ou MasterCard). "
    + "Assurance tous risques avec franchise selon la responsabilité du conducteur. "
    + "Circulation autorisée au Maroc uniquement. Sous-location et compétition interdites. Véhicules non-fumeurs.",
};

const AGENCE = {
  adresse: "Boulevard Bir Anzarane, 4 rue Charif El Idrissi, Maarif, 20600 Casablanca",
  ville: "Casablanca",
  telephones: ["+212664474499", "+212661095144"],
  siteWeb: "https://www.horentcar.com",
};

// Leur catégorie « VAN » n'existe pas dans notre énumération : c'est un
// monospace. Les quatre autres se recouvrent exactement.
const CATEGORIES = { Citadine: "Citadine", Berline: "Berline", SUV: "SUV", VAN: "Monospace", Utilitaire: "Utilitaire" };

// Suffixes de ville et mentions de boîte présents dans NOS titres et absents du
// catalogue du site. BVA/BVM ne sont pas du bruit — ils disent la transmission,
// et distinguent deux tarifs réels (GEELY GX3 PRO : 270 en BVA, 300 en BVM).
const VILLES = /\b(casa|casablanca|kech|marrakech|tanger|tangier|rabat|agadir|fes|nador|oujda)\b/gi;
const norm = (s) => String(s || "").toUpperCase()
  .replace(VILLES, " ")
  .replace(/\b(BVA|BVM|AUTO|AUTOMATIQUE|MANUEL|MANUELLE|HL|PRO)\b/g, " ")
  .replace(/[^A-Z0-9]/g, "");

// Écarts de libellé irréductibles à une règle : marque répétée dans notre titre
// (« MG MG3 »), ou faute de frappe d'origine (« C-ELLYSE »). Une table explicite
// de six entrées se relit ; un rapprochement approximatif rapprocherait un jour
// deux modèles distincts sans que personne s'en aperçoive.
const ALIAS = {
  MGMG3:            "MG3",
  DSDS7:            "DS7",
  DSDS4:            "DS4",
  HYUNDAII10:       "HYUNDAIGRANDI10",
  CITROENCELLYSE:   "CITROENCELYSEE",
  CITROENCELLYSEE:  "CITROENCELYSEE",
};

const boiteAnnoncee = (t) => (/\bBVA\b|AUTOMATIQ/i.test(t) ? "Automatique" : (/\bBVM\b|MANUEL/i.test(t) ? "Manuelle" : null));

function faireIndex(parc) {
  const index = parc.map((p) => ({ ...p, k: norm(p.nom) }));
  return (titre) => {
    const t = ALIAS[norm(titre)] || norm(titre);
    const b = boiteAnnoncee(titre);
    let c = index.filter((p) => p.k === t);
    if (!c.length) c = index.filter((p) => t.startsWith(p.k) || p.k.startsWith(t)).sort((x, y) => y.k.length - x.k.length);
    if (!c.length) return null;
    if (c.length > 1 && b) { const m = c.find((x) => x.transmission === b); if (m) return m; }
    return c.sort((x, y) => x.prixMAD - y.prixMAD)[0];
  };
}

// Quelques adresses de fiche portent le millésime ; c'est la seule source
// d'année du site. Aucune autre annonce n'en reçoit.
const anneeDepuisUrl = (url) => {
  const m = String(url || "").match(/\b(20[12]\d)\b/);
  const a = m ? Number(m[1]) : null;
  return a && a >= 2015 && a <= new Date().getFullYear() + 1 ? a : null;
};

async function main() {
  if (!FICHIER || !fs.existsSync(FICHIER)) {
    console.error("Usage : node scripts/syncHorentFromSite.js <parc.json> [--confirm]");
    process.exit(1);
  }
  if (!isImageKitConfigured()) throw new Error("ImageKit non configuré — les photos ne pourraient pas être hébergées.");

  const parc = JSON.parse(fs.readFileSync(FICHIER, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ ÉCRITURE RÉELLE\n" : "\n🔍 SIMULATION — ajouter --confirm pour écrire\n");

  const taux = await getRateFromUSD("MAD");
  const enUSD = (mad) => Math.round((mad / taux) * 100) / 100;
  const user = await User.findOne({ email: EMAIL });
  const nos = await Vehicle.find({ owner: user._id });
  const chercher = faireIndex(parc);

  const paires = [];
  const orphelins = [];
  for (const v of nos) {
    const p = chercher(v.title);
    if (p) paires.push([v, p]); else orphelins.push(v.title);
  }

  console.log(`parc du site ......... ${parc.length} modèles`);
  console.log(`nos annonces ......... ${nos.length}`);
  console.log(`rapprochées .......... ${paires.length}`);
  console.log(`sans équivalent ...... ${orphelins.length}`);

  const changements = paires.filter(([v, p]) =>
    v.pricePerDayEntered !== p.prixMAD || v.transmission !== p.transmission
    || v.carburant !== p.carburant || v.vehicleType !== CATEGORIES[p.categorie]
    || v.dureeMinLocation !== CONDITIONS.dureeMinimaleJours || v.ageMin !== CONDITIONS.ageMinimum
    || !v.images?.[0]?.includes("/horent/"));
  console.log(`à mettre à jour ...... ${changements.length}`);

  const tarifs = paires.filter(([v, p]) => v.pricePerDayEntered !== p.prixMAD);
  console.log(`\ndont ${tarifs.length} tarifs corrigés :`);
  const resume = {};
  tarifs.forEach(([v, p]) => { const k = `${v.pricePerDayEntered || "—"} → ${p.prixMAD}`; resume[k] = (resume[k] || 0) + 1; });
  Object.entries(resume).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([k, n]) => console.log(`   ${String(n).padStart(3)}×  ${k} MAD`));

  if (orphelins.length) {
    console.log(`\nlaissées telles quelles (absentes du site aujourd'hui) :`);
    console.log(`   ${[...new Set(orphelins)].join(" | ")}`);
  }

  if (!CONFIRME) {
    console.log(`\n══ Simulation : ${changements.length} annonces à mettre à jour, ${new Set(paires.map(([, p]) => p.photo)).size} photos à héberger.`);
    await mongoose.disconnect();
    return;
  }

  // ── Photos : les leurs, hébergées chez nous ───────────────────────────────
  // Les octets sont récupérés ICI, pas par ImageKit depuis l'URL source : leur
  // serveur répond 200 à un navigateur mais refuse le récupérateur d'ImageKit,
  // qui échoue alors au milieu du lot sans que rien ne l'ait laissé prévoir.
  // Passer l'image encodée retire complètement cette dépendance.
  const NAVIGATEUR = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" };
  const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

  // Reprise : ce qui a déjà été déposé lors d'une exécution précédente. Sans
  // cela, un échec au milieu du lot recommence tous les téléversements et
  // laisse des doublons sur le CDN (useUniqueFileName oblige).
  const cache = new Map();
  const dejaLa = new Map();
  for (const v of nos) {
    const u0 = v.images?.[0];
    if (typeof u0 === "string" && u0.includes("/horent/")) {
      const p0 = chercher(v.title);
      if (p0) dejaLa.set(p0.photo, u0);
    }
  }
  if (dejaLa.size) console.log(`${dejaLa.size} photos déjà hébergées lors d'un passage précédent — non retéléversées.\n`);

  async function heberger(p) {
    if (cache.has(p.photo)) return cache.get(p.photo);
    if (dejaLa.has(p.photo)) { cache.set(p.photo, dejaLa.get(p.photo)); return dejaLa.get(p.photo); }

    const ext = p.photo.split(".").pop().split("?")[0].toLowerCase();
    const rep = await fetch(p.photo, { headers: NAVIGATEUR });
    if (!rep.ok) throw new Error(`photo inaccessible (${rep.status}) : ${p.nom}`);
    const b64 = Buffer.from(await rep.arrayBuffer()).toString("base64");

    const r = await uploadImage(`data:${MIMES[ext] || "image/jpeg"};base64,${b64}`, {
      folder: `${FOLDERS.vehicles}/horent`,
      fileName: `${norm(p.nom).toLowerCase() || "vehicule"}.${ext}`,
      tags: ["horent", "catalogue-partenaire"],
    });
    if (!r?.url) throw new Error(`échec du téléversement : ${p.nom}`);
    cache.set(p.photo, r.url);
    await new Promise((res) => setTimeout(res, 250));
    return r.url;
  }

  let maj = 0;
  for (const [v, p] of paires) {
    const url = await heberger(p);
    const annee = anneeDepuisUrl(p.url);

    v.pricePerDayEntered  = p.prixMAD;
    v.priceEntryCurrency  = "MAD";
    v.pricePerDay         = enUSD(p.prixMAD);
    v.transmission        = p.transmission;
    v.carburant           = p.carburant;
    v.vehicleType         = CATEGORIES[p.categorie] || v.vehicleType;
    v.images              = [url];
    v.thumbnail           = url;
    v.dureeMinLocation    = CONDITIONS.dureeMinimaleJours;
    v.ageMin              = CONDITIONS.ageMinimum;
    v.fuelPolicy          = CONDITIONS.politiqueCarburant;
    v.cancellationPolicy  = CONDITIONS.politiqueAnnulation;
    v.insuranceIncluded   = CONDITIONS.assuranceIncluse;
    if (annee) v.annee = annee;
    await v.save();
    maj += 1;
    if (maj % 50 === 0) console.log(`   … ${maj}/${paires.length}`);
  }
  console.log(`\n${maj} annonces alignées, ${cache.size} photos hébergées.`);

  // ── Conditions et coordonnées de l'agence ─────────────────────────────────
  const business = await PartnerBusiness.findOne({ owner: user._id });
  if (business) {
    business.ville      = business.ville || AGENCE.ville;
    business.adresse    = AGENCE.adresse;
    business.contactTel = business.contactTel || AGENCE.telephones[0];
    // Les champs sont posés UN PAR UN, jamais par diffusion de l'objet.
    // `rentalPolicy` est un sous-document Mongoose : le diffuser renvoie ses
    // clés internes et transforme les sous-objets non chargés (`rentalOptions`)
    // en `undefined`, ce que la validation refuse. Écrire champ par champ
    // laisse intact tout ce que le partenaire a pu configurer par ailleurs.
    business.rentalPolicy.minimumAge             = CONDITIONS.ageMinimum;
    business.rentalPolicy.minimumLicenseYears    = CONDITIONS.ancienneteDuPermisAnnees;
    business.rentalPolicy.depositRequired        = true;
    business.rentalPolicy.additionalRequirements = CONDITIONS.autresExigences;
    await business.save();
    console.log(`entité mise à jour : ${business.companyName} — âge min ${CONDITIONS.ageMinimum}, permis ${CONDITIONS.ancienneteDuPermisAnnees} ans, ${CONDITIONS.dureeMinimaleJours} jours minimum`);
  }

  // Le seul numéro porté par les annonces datait de l'import ; le site en
  // publie deux, dont un principal différent.
  const r = await Vehicle.updateMany({ owner: user._id }, { $set: { contactTel: AGENCE.telephones[0] } });
  console.log(`téléphone de contact propagé sur ${r.modifiedCount} annonces`);

  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
