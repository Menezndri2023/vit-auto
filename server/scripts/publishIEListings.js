import mongoose from "mongoose";
import dotenv from "dotenv";
import ImportExportListing from "../models/ImportExportListing.js";
import Vehicle from "../models/Vehicle.js";
import ImporterPartnerProfile from "../models/ImporterPartnerProfile.js";
import { validateListingForPublication } from "../services/ieListingValidation.js";
import { resolveOriginCode } from "../constants/importOrigins.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// PUBLICATION DES ANNONCES IMPORT/EXPORT + BASCULE DES VÉHICULES ÉTRANGERS
// ═══════════════════════════════════════════════════════════════════════════
// Deux opérations, décidées par le gérant :
//
// 1. PUBLIER les annonces Import/Export restées en attente. 211 annonces
//    existaient, AUCUNE approuvée : la vitrine publique était donc vide, et
//    ce n'était pas un défaut d'affichage — il n'y avait littéralement rien à
//    montrer.
//
// 2. BASCULER en import les véhicules étrangers du catalogue ordinaire. Neuf
//    véhicules situés en Chine y figuraient en `type: "vente"`, ce qui déclenche
//    une réservation de type ESSAI — un rendez-vous d'essai pour une voiture
//    qui se trouve à Shanghai. Ils deviennent des annonces d'import, et le
//    véhicule d'origine est archivé (il quitte le catalogue de location/vente).
//
// SIMULATION PAR DÉFAUT. Rien n'est écrit sans `--confirm` : ces opérations
// touchent la vitrine publique et sont malaisées à défaire.
//
//   node scripts/publishIEListings.js            → simulation
//   node scripts/publishIEListings.js --confirm  → exécution

const CONFIRME = process.argv.includes("--confirm");

// Mêmes correspondances que vehicleController.convertVehicleToExport.
const CARBURANT = { Essence: "essence", Diesel: "diesel", Hybride: "hybride", Électrique: "electrique", Electrique: "electrique" };
const TRANSMISSION = { Automatique: "automatique", Manuelle: "manuelle", CVT: "cvt" };
const ETAT = { Neuf: "neuf", "Occasion": "occasion", "Reconditionné": "reconditionne" };

// Plancher de vraisemblance. Les neuf véhicules chinois du catalogue portent un
// prix de 12,51 à 15,12 SANS DEVISE : selon toute vraisemblance des 万元
// chinois (dizaines de milliers de yuans) repris tels quels d'un site chinois,
// soit un facteur 10 000 d'écart. Les convertir en l'état créerait des annonces
// d'importation à 13 dollars.
//
// On refuse plutôt que de deviner : multiplier au hasard produirait un prix
// faux avec l'apparence du sérieux, sur lequel un acheteur engagerait un achat
// international.
const PRIX_PLANCHER_USD = 500;

async function publierAnnonces() {
  const enAttente = await ImportExportListing.find({ status: "pending" }).lean();
  const publiables = [];
  const retenues = [];

  for (const l of enAttente) {
    const controle = await validateListingForPublication(l);
    if (controle.valid) publiables.push({ l, warnings: controle.warnings });
    else retenues.push({ l, errors: controle.errors });
  }

  console.log(`\n── Annonces Import/Export en attente : ${enAttente.length}`);
  console.log(`   publiables : ${publiables.length}`);
  console.log(`   retenues   : ${retenues.length}`);

  if (retenues.length) {
    console.log("\n   Retenues (erreur bloquante) :");
    for (const { l, errors } of retenues.slice(0, 10)) {
      console.log(`     • ${String(l.title).slice(0, 48)} — ${errors[0].message}`);
    }
    if (retenues.length > 10) console.log(`     … et ${retenues.length - 10} autres`);
  }

  const avecAvertissement = publiables.filter((p) => p.warnings.length);
  if (avecAvertissement.length) {
    console.log(`\n   Publiables MAIS à surveiller : ${avecAvertissement.length}`);
    const parType = {};
    for (const { warnings } of avecAvertissement) {
      for (const w of warnings) parType[w.field] = (parType[w.field] || 0) + 1;
    }
    for (const [champ, n] of Object.entries(parType)) console.log(`     • ${champ} : ${n} annonce(s)`);
  }

  if (CONFIRME && publiables.length) {
    const ids = publiables.map((p) => p.l._id);
    const r = await ImportExportListing.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "approved", approvedAt: new Date(), updatedAt: new Date() } }
    );
    console.log(`\n   ✅ ${r.modifiedCount} annonce(s) publiée(s).`);
  }

  return { total: enAttente.length, publiables: publiables.length, retenues: retenues.length };
}

async function basculerVehiculesEtrangers() {
  // Un véhicule dont le pays est une ORIGINE D'IMPORT ne peut pas être essayé
  // sur place par un client d'Afrique de l'Ouest ou du Maroc : il relève de
  // l'import, pas de la vente locale avec rendez-vous d'essai.
  const candidats = await Vehicle.find({
    status: { $in: ["approved", "pending"] },
    country: { $nin: [null, ""] },
  }).select("title marque modele annee kilometrage carburant transmission vehicleType couleur etat description country ville images thumbnail priceForSale buyPrice owner status type").lean();

  const aBasculer = candidats.filter((v) => {
    // UNIQUEMENT les véhicules en VENTE. Un véhicule de LOCATION situé à
    // l'étranger est loué sur place — les dix utilitaires d'un partenaire
    // parisien n'ont rien à faire dans un catalogue d'import, et les basculer
    // supprimerait son activité. Distinction indispensable : sans elle, la
    // simulation les proposait tous les dix.
    if (v.type !== "vente") return false;
    const origine = resolveOriginCode(v.country);
    // MA et CI sont des marchés de DESTINATION : un véhicule qui s'y trouve est
    // vendu sur place, pas importé.
    return origine && !["MA", "CI"].includes(origine);
  });

  console.log(`\n── Véhicules du catalogue situés dans un pays d'origine : ${aBasculer.length}`);

  let bascules = 0;
  let ignores = 0;

  for (const v of aBasculer) {
    const profil = await ImporterPartnerProfile.findOne({ userId: v.owner }).select("_id").lean();
    const prix = v.priceForSale || v.buyPrice;

    if (!profil || !prix) {
      ignores += 1;
      console.log(`     ⚠️  ${String(v.title).slice(0, 44)} — ${!profil ? "aucun profil exportateur" : "aucun prix de vente"}`);
      continue;
    }

    if (prix < PRIX_PLANCHER_USD) {
      ignores += 1;
      console.log(`     ⛔ ${String(v.title).slice(0, 44)} — prix invraisemblable : ${prix} (unité d'origine probablement non convertie)`);
      continue;
    }

    console.log(`     → ${String(v.title).slice(0, 44)} (${v.country}) — ${prix}`);

    if (CONFIRME) {
      await ImportExportListing.create({
        partner: v.owner,
        importerProfile: profil._id,
        convertedFromVehicle: v._id,
        title: v.title,
        make: v.marque || "—", model: v.modele || "—",
        year: v.annee || new Date().getFullYear(),
        mileage: v.kilometrage || 0,
        fuelType: CARBURANT[v.carburant] || "autre",
        transmission: TRANSMISSION[v.transmission] || "automatique",
        bodyType: v.vehicleType || "", color: v.couleur || "",
        condition: ETAT[v.etat] || "occasion",
        description: v.description || "",
        sourceCountry: v.country, sourceCity: v.ville || "",
        // Marchés desservis par VIT AUTO — le véhicule devient importable vers
        // eux, alors qu'il n'était jusqu'ici « essayable » nulle part.
        availableIn: ["Maroc", "Côte d'Ivoire", "Sénégal"],
        price: prix, currency: "USD",
        photos: v.images || [],
        mainPhoto: v.thumbnail || v.images?.[0] || null,
        status: "approved", approvedAt: new Date(),
      });

      await Vehicle.updateOne(
        { _id: v._id },
        {
          $set: { status: "archived", available: false },
          $push: { statusHistory: { status: "archived", changedAt: new Date() } },
        }
      );
      bascules += 1;
    }
  }

  return { candidats: aBasculer.length, bascules, ignores };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ MODE EXÉCUTION" : "\n🔍 SIMULATION — aucune écriture (ajouter --confirm pour exécuter)");

  const annonces = await publierAnnonces();
  const vehicules = await basculerVehiculesEtrangers();

  console.log("\n══ Résumé ══");
  console.log(`   annonces en attente ....... ${annonces.total}`);
  console.log(`   → publiables .............. ${annonces.publiables}`);
  console.log(`   → retenues ................ ${annonces.retenues}`);
  console.log(`   véhicules à basculer ...... ${vehicules.candidats}`);
  console.log(`   → sans profil ou sans prix  ${vehicules.ignores}`);
  if (!CONFIRME) console.log("\n   (simulation : rien n'a été écrit)");

  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
