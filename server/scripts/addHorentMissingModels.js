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
// MODÈLES DU PARC HO RENT ABSENTS DE NOTRE CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════
// L'import en masse d'origine n'avait pas repris tout le parc : sept modèles
// publiés sur horentcar.com n'existaient nulle part chez nous — et ce sont
// précisément les plus chers (750 à 3 000 MAD/jour). Tout le haut de gamme de
// l'agence était donc invisible pour un client qui cherchait exactement ça.
//
// Créés dans la ville de l'agence (Casablanca), la seule dont le site donne
// une adresse. Statut `pending` : ce sont de nouvelles annonces, elles passent
// par la modération comme n'importe quelle autre.
//
//   node scripts/addHorentMissingModels.js <parc.json>            → simulation
//   node scripts/addHorentMissingModels.js <parc.json> --confirm  → création

const CONFIRME = process.argv.includes("--confirm");
const FICHIER = process.argv.slice(2).find((a) => a.endsWith(".json"));
const EMAIL = "ho.rentacar@gmail.com";

const MANQUANTS = [
  "CUPRA FORMENTOR", "AUDI A3", "MERCEDES CLA 220 BVA",
  "RANGE ROVER EVOQUE", "MASERATI GRECALE", "AUDI Q8", "LAND ROVER SPORT",
];

const CATEGORIES = { Citadine: "Citadine", Berline: "Berline", SUV: "SUV", VAN: "Monospace", Utilitaire: "Utilitaire" };
const NAVIGATEUR = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" };
const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Le titre reprend le libellé du site, en casse normale : « MERCEDES CLA 220
// BVA » crié en majuscules dans un catalogue est illisible, et « BVA » est déjà
// porté par le champ transmission.
const titre = (nom) => nom.replace(/\s+BVA$/i, "").split(/\s+/)
  .map((m) => (m.length <= 3 && m === m.toUpperCase() ? m : m[0].toUpperCase() + m.slice(1).toLowerCase()))
  .join(" ");

const marqueEtModele = (nom) => {
  const t = titre(nom).split(" ");
  // Marques dont le nom tient en DEUX mots. « Mercedes » n'en fait pas partie :
  // l'y mettre donnait la marque « Mercedes CLA » et le modèle « 220 ».
  const doubles = ["Range", "Land", "Alfa"];
  const n = doubles.includes(t[0]) ? 2 : 1;
  return { marque: t.slice(0, n).join(" "), modele: t.slice(n).join(" ") || t[0] };
};

async function main() {
  if (!FICHIER || !fs.existsSync(FICHIER)) {
    console.error("Usage : node scripts/addHorentMissingModels.js <parc.json> [--confirm]");
    process.exit(1);
  }
  if (!isImageKitConfigured()) throw new Error("ImageKit non configuré.");

  const parc = JSON.parse(fs.readFileSync(FICHIER, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ CRÉATION RÉELLE\n" : "\n🔍 SIMULATION — ajouter --confirm pour créer\n");

  const taux = await getRateFromUSD("MAD");
  const enUSD = (mad) => Math.round((mad / taux) * 100) / 100;
  const user = await User.findOne({ email: EMAIL });
  const business = await PartnerBusiness.findOne({ owner: user._id });

  const aCreer = parc.filter((p) => MANQUANTS.includes(p.nom));
  if (aCreer.length !== MANQUANTS.length) {
    console.error(`⛔ ${MANQUANTS.length - aCreer.length} modèle(s) introuvable(s) dans le fichier de parc — arrêt.`);
    process.exit(1);
  }

  for (const p of aCreer) {
    const { marque, modele } = marqueEtModele(p.nom);
    const existe = await Vehicle.exists({ owner: user._id, title: titre(p.nom) });
    console.log(`   ${String(p.prixMAD).padStart(4)} MAD  ${titre(p.nom).padEnd(24)} ${marque} / ${modele}  ${p.transmission}/${p.carburant}/${CATEGORIES[p.categorie]}${existe ? "   (déjà en base)" : ""}`);
  }

  if (!CONFIRME) {
    console.log(`\n══ Simulation : ${aCreer.length} annonces à créer à ${business.ville}.`);
    await mongoose.disconnect();
    return;
  }

  let creees = 0;
  for (const p of aCreer) {
    if (await Vehicle.exists({ owner: user._id, title: titre(p.nom) })) continue;

    const ext = p.photo.split(".").pop().split("?")[0].toLowerCase();
    const rep = await fetch(p.photo, { headers: NAVIGATEUR });
    if (!rep.ok) throw new Error(`photo inaccessible (${rep.status}) : ${p.nom}`);
    const b64 = Buffer.from(await rep.arrayBuffer()).toString("base64");
    const img = await uploadImage(`data:${MIMES[ext] || "image/jpeg"};base64,${b64}`, {
      folder: `${FOLDERS.vehicles}/horent`,
      fileName: `${p.nom.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.${ext}`,
      tags: ["horent", "catalogue-partenaire"],
    });
    if (!img?.url) throw new Error(`échec du téléversement : ${p.nom}`);

    const { marque, modele } = marqueEtModele(p.nom);
    await Vehicle.create({
      owner: user._id, business: business._id,
      title: titre(p.nom), marque, modele,
      type: "location",
      vehicleType: CATEGORIES[p.categorie],
      transmission: p.transmission,
      carburant: p.carburant,
      pricePerDay: enUSD(p.prixMAD), pricePerDayEntered: p.prixMAD, priceEntryCurrency: "MAD",
      images: [img.url], thumbnail: img.url,
      ville: business.ville, adresse: business.adresse, country: "MA",
      contactNom: business.contactNom, contactTel: business.contactTel,
      dureeMinLocation: 3, ageMin: 23, insuranceIncluded: true,
      fuelPolicy: "Carburant identique : le véhicule est restitué avec le même niveau qu'au départ.",
      cancellationPolicy: "Annulation gratuite.",
      status: "pending",
    });
    creees += 1;
    console.log(`   ✓ ${titre(p.nom)}`);
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n══ ${creees} annonces créées, en attente de modération.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
