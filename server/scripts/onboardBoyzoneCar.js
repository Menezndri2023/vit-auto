import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Vehicle from "../models/Vehicle.js";
import { uploadImage, isImageKitConfigured, FOLDERS } from "../config/imagekit.js";
import { getRateFromUSD } from "../services/currencyEngine.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// INTÉGRATION DE BOYZONE CAR (Aïn Sebaâ, Casablanca)
// ═══════════════════════════════════════════════════════════════════════════
// Agence de location, gérant Oussama Nouzri. Tout est relevé sur boyzonecar.ma :
// six véhicules avec tarif, boîte, carburant, places, portes et leurs propres
// visuels ; les conditions viennent de leurs pages terms.html et faq.html.
//
// Ce que leur site ne dit PAS n'est pas comblé : montant de la caution, durée
// minimale de location, kilométrage inclus, millésime des véhicules. Aucune
// valeur plausible n'est inventée à leur place.
//
//   node scripts/onboardBoyzoneCar.js <parc.json>            → simulation
//   node scripts/onboardBoyzoneCar.js <parc.json> --confirm  → création

const CONFIRME = process.argv.includes("--confirm");
const FICHIER = process.argv.slice(2).find((a) => a.endsWith(".json"));

const AGENCE = {
  companyName: "BOYZONE CAR",
  gerant: { firstName: "Oussama", lastName: "Nouzri" },
  email: "oussamanouzrixd@gmail.com",
  // Le premier numéro est celui du gérant, le second l'assistance 24h/24
  // annoncée sur leur FAQ.
  phone: "+212656088121",
  assistance: "+212654040138",
  emailAgence: "boyzonecar@boyzonecar.ma",
  country: "MA",
  ville: "Casablanca",
  adresse: "3 Allée des Parcs, RDC appt/mag n°2, angle Eucalyptus, Aïn Sebaâ, Casablanca",
  siteWeb: "https://boyzonecar.ma",
};

// Conditions relevées sur terms.html et faq.html.
const CONDITIONS = {
  ageMinimum: 21,
  ancienneteDuPermisAnnees: 1,
  politiqueCarburant: "Le véhicule est restitué avec le même niveau de carburant qu'à la remise ; toute différence est facturée au tarif de l'agence.",
  politiqueAnnulation: "Annulation sans frais jusqu'à 48 h avant le départ. Moins de 24 h avant : une journée facturée. Absence au rendez-vous : deux journées facturées.",
  autresExigences:
    "Permis de conduire valide et pièce d'identité (CIN ou passeport) exigés à la remise des clés. "
    + "Tout conducteur additionnel doit être identifié au contrat et présenter son permis original. "
    + "Paiement en espèces, par carte bancaire ou en ligne. "
    + "Circulation hors du territoire marocain strictement interdite sauf autorisation écrite. "
    + "Livraison et restitution à l'agence de Casablanca, à l'aéroport Mohammed V, à l'hôtel ou en centre-ville, de 8 h à 20 h. "
    + "Prolongation possible sous réserve de disponibilité, à demander 24 h avant la fin du contrat.",
};

// Leurs catégories vers notre énumération. « economy »/« standard » ne disent
// rien de la carrosserie : c'est le modèle qui tranche.
const TYPE_PAR_CODE = {
  "dacia-logan":    "Berline",
  "clio-5":         "Citadine",
  "clio-5-2":       "Citadine",
  "dacia-sandero":  "Citadine",
  "hyundai-tucson": "SUV",
  // Doblo : leur propre catégorie porte « utilitaire », on la suit.
  "fiat-doblo":     "Utilitaire",
};

// Deux Renault Clio partagent le même nom sur leur site et ne se distinguent
// que par la boîte et le carburant. Un catalogue affichant deux annonces
// identiques laisse le client choisir au hasard.
const TITRE_PAR_CODE = {
  "clio-5":   "Renault Clio 5",
  "clio-5-2": "Renault Clio 5 automatique",
};

const CARBURANTS = { diesel: "Diesel", essence: "Essence", petrol: "Essence", hybrid: "Hybride", electric: "Électrique" };
const BOITES = { manual: "Manuelle", automatic: "Automatique", automatique: "Automatique" };
const NAVIGATEUR = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" };
const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const marqueEtModele = (nom) => {
  const t = nom.trim().split(/\s+/);
  return { marque: t[0], modele: t.slice(1).join(" ") || t[0] };
};

function motDePasseTemporaire() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return "Boyzone-" + [...crypto.randomBytes(16)].map((b) => alphabet[b % alphabet.length]).join("").slice(0, 12);
}

async function main() {
  if (!FICHIER || !fs.existsSync(FICHIER)) {
    console.error("Usage : node scripts/onboardBoyzoneCar.js <parc.json> [--confirm]");
    process.exit(1);
  }
  if (!isImageKitConfigured()) throw new Error("ImageKit non configuré.");

  const parc = JSON.parse(fs.readFileSync(FICHIER, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ CRÉATION RÉELLE\n" : "\n🔍 SIMULATION — ajouter --confirm pour créer\n");

  const taux = await getRateFromUSD("MAD");
  const enUSD = (mad) => Math.round((mad / taux) * 100) / 100;
  const existant = await User.findOne({ email: AGENCE.email });

  console.log(`agence ......... ${AGENCE.companyName}`);
  console.log(`gérant ......... ${AGENCE.gerant.firstName} ${AGENCE.gerant.lastName}`);
  console.log(`contact ........ ${AGENCE.email} · ${AGENCE.phone} (assistance ${AGENCE.assistance})`);
  console.log(`adresse ........ ${AGENCE.adresse}`);
  console.log(`conditions ..... ${CONDITIONS.ageMinimum} ans · permis ${CONDITIONS.ancienneteDuPermisAnnees} an`);
  console.log(`compte existant  ${existant ? "OUI" : "non"}\n`);

  for (const v of parc) {
    const titre = TITRE_PAR_CODE[v.code] || v.nom;
    console.log(`   ${String(v.prixMAD).padStart(4)} MAD  ${titre.padEnd(28)} ${TYPE_PAR_CODE[v.code]}/${BOITES[v.transmission] || "Automatique"}/${CARBURANTS[v.carburant]}  ${v.places}pl ${v.portes}p`);
  }

  if (!CONFIRME) {
    console.log(`\n══ Simulation : 1 compte, 1 entité, ${parc.length} annonces, ${parc.length} photos à héberger.`);
    await mongoose.disconnect();
    return;
  }

  let motDePasse = null;
  let user = existant;
  if (!user) {
    motDePasse = motDePasseTemporaire();
    user = await User.create({
      firstName: AGENCE.gerant.firstName,
      lastName:  AGENCE.gerant.lastName,
      email:     AGENCE.email,
      password:  await bcrypt.hash(motDePasse, 10),
      phone:     AGENCE.phone,
      role:      "partenaire",
      partnerActivity: "loueur",
      entityType: "entreprise",
      country: AGENCE.country,
      isActive: true,
      emailVerified: true,
    });
  }

  const business = await PartnerBusiness.findOneAndUpdate(
    { owner: user._id, companyName: AGENCE.companyName },
    { $setOnInsert: {
      owner: user._id, companyName: AGENCE.companyName, country: AGENCE.country,
      ville: AGENCE.ville, adresse: AGENCE.adresse,
      contactNom: `${AGENCE.gerant.firstName} ${AGENCE.gerant.lastName}`,
      contactTel: AGENCE.phone, isDefault: true,
    } },
    { upsert: true, new: true }
  );

  // Champ par champ, jamais par diffusion : `rentalPolicy` est un sous-document
  // et le diffuser transforme ses sous-objets non chargés en `undefined`.
  business.rentalPolicy.minimumAge             = CONDITIONS.ageMinimum;
  business.rentalPolicy.minimumLicenseYears    = CONDITIONS.ancienneteDuPermisAnnees;
  business.rentalPolicy.identityDocumentRequired = true;
  business.rentalPolicy.drivingLicenseRequired   = true;
  business.rentalPolicy.additionalRequirements   = CONDITIONS.autresExigences;
  // Leur FAQ énumère précisément ces quatre options. Le tarif reste `null` :
  // ils ne le publient pas, on retombe donc sur le catalogue global plutôt que
  // d'inventer un montant qui apparaîtrait au client comme étant le leur.
  for (const opt of ["driver", "babySeat", "gps", "insurance"]) {
    business.rentalPolicy.rentalOptions[opt].offered = true;
  }
  await business.save();
  console.log(`✓ compte ${user.email}${motDePasse ? "" : "  (déjà existant)"}\n✓ entité ${business.companyName}\n`);

  let creees = 0;
  for (const v of parc) {
    const titre = TITRE_PAR_CODE[v.code] || v.nom;
    if (await Vehicle.exists({ owner: user._id, title: titre })) {
      console.log(`   · ${titre} (déjà en base)`); continue;
    }

    const ext = v.photo.split(".").pop().split("?")[0].toLowerCase();
    const rep = await fetch(v.photo, { headers: NAVIGATEUR });
    if (!rep.ok) throw new Error(`photo inaccessible (${rep.status}) : ${v.nom}`);
    const b64 = Buffer.from(await rep.arrayBuffer()).toString("base64");
    const img = await uploadImage(`data:${MIMES[ext] || "image/jpeg"};base64,${b64}`, {
      folder: `${FOLDERS.vehicles}/boyzone`,
      fileName: `${v.code}.${ext}`,
      tags: ["boyzone", "catalogue-partenaire"],
    });
    if (!img?.url) throw new Error(`échec du téléversement : ${v.nom}`);

    const { marque, modele } = marqueEtModele(v.nom);
    await Vehicle.create({
      owner: user._id, business: business._id,
      title: titre, marque, modele,
      type: "location",
      vehicleType: TYPE_PAR_CODE[v.code],
      transmission: BOITES[v.transmission] || "Automatique",
      carburant: CARBURANTS[v.carburant],
      nombrePlaces: v.places, nombrePortes: v.portes,
      climatisation: true,
      pricePerDay: enUSD(v.prixMAD), pricePerDayEntered: v.prixMAD, priceEntryCurrency: "MAD",
      images: [img.url], thumbnail: img.url,
      ville: AGENCE.ville, adresse: AGENCE.adresse, country: AGENCE.country,
      contactNom: business.contactNom, contactTel: AGENCE.phone,
      ageMin: CONDITIONS.ageMinimum,
      insuranceIncluded: true,
      fuelPolicy: CONDITIONS.politiqueCarburant,
      cancellationPolicy: CONDITIONS.politiqueAnnulation,
      // Leur site ne donne ni durée minimale ni caution : les champs restent à
      // leur défaut plutôt que de porter une règle qu'ils n'ont pas énoncée.
      status: "approved", available: true,
    });
    creees += 1;
    console.log(`   ✓ ${String(v.prixMAD).padStart(4)} MAD  ${titre}`);
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n══ ${creees} annonces créées et publiées.`);
  if (motDePasse) {
    console.log(`\n🔑 Mot de passe temporaire de ${AGENCE.email} :\n\n      ${motDePasse}\n`);
    console.log("   À transmettre par WhatsApp ou SMS, jamais par e-mail à cette adresse.");
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
