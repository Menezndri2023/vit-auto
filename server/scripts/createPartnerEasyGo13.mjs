/**
 * Script ponctuel : création du compte partenaire EASY GO 13 (loueur
 * d'utilitaires, Paris, France) et de ses 10 annonces de location.
 * Idempotent : relançable sans créer de doublon.
 * Usage : node server/scripts/createPartnerEasyGo13.mjs
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Vehicle from "../models/Vehicle.js";
import { convertAmount } from "../services/currencyEngine.js";

const EMAIL = "easyrent13@outlook.fr";
const PHONE = "+33622452659";
const COMPANY = "EASY GO 13";
const CONTACT_NOM = "Dakhlaoui Mohamed Imade";
const ADRESSE = "60 rue François 1er, 75008 Paris";
const VILLE = "Paris";
const COUNTRY = "FR";
const PASSWORD = process.env.PARTNER_SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");

// Conditions communes annoncées par le partenaire pour toute la flotte.
const CONDITIONS =
  "120 km inclus dans le tarif. Documents exigés à la prise en charge : permis de conduire en cours de validité et justificatif de domicile. Véhicule disponible tous les jours.";

const W = "https://upload.wikimedia.org/wikipedia/commons";

// 2 photos Wikimedia Commons par modèle (toutes vérifiées HTTP 200 / image/jpeg),
// même méthode que la flotte HO RENT : photos d'illustration par modèle, pas des
// photos des véhicules réels.
const FLEET = [
  {
    title: "Iveco Daily — Camion benne",
    marque: "Iveco", modele: "Daily", annee: 2008,
    body: "benne", priceEUR: 70,
    blurb: "Camion benne utilitaire, idéal pour l'évacuation de gravats, les déchets verts et le transport de matériaux.",
    images: [
      `${W}/7/7e/Iveco_Daily_70C18_Kipper_Meiller.jpg`,
      `${W}/c/cb/Iveco_Daily_III_Pritsche_front_20081229.jpg`,
    ],
  },
  {
    title: "Fiat Scudo — Utilitaire 6 m³",
    marque: "Fiat", modele: "Scudo", annee: 2007,
    body: "fourgon", priceEUR: 50,
    blurb: "Fourgon compact de 6 m³, facile à manœuvrer et à stationner en ville — parfait pour un petit déménagement ou des livraisons.",
    images: [
      `${W}/b/b9/Fiat_Scudo_II_front_20100808.jpg`,
      `${W}/a/a5/Fiat_Scudo_II_rear_20100808.jpg`,
    ],
  },
  {
    title: "Renault Master III — Utilitaire 12 m³ n°1",
    marque: "Renault", modele: "Master III", annee: 2014,
    body: "fourgon", priceEUR: 50,
    blurb: "Fourgon 12 m³ à grand volume utile, adapté aux déménagements et au transport de mobilier volumineux.",
    images: [
      `${W}/b/b1/Renault_Master_III_front_20100501.jpg`,
      `${W}/d/d2/Renault_Master_III_rear_20100501.jpg`,
    ],
  },
  {
    title: "Renault Master II — Utilitaire 12 m³",
    marque: "Renault", modele: "Master II", annee: 2008,
    body: "fourgon", priceEUR: 50,
    blurb: "Fourgon 12 m³ robuste et éprouvé, adapté aux déménagements et au transport de charges encombrantes.",
    images: [
      `${W}/6/65/Renault_Master_II_Phase_I_dCi_80.JPG`,
      `${W}/1/1f/Renault_Master_II_Phase_I_dCi_80_Heck.JPG`,
    ],
  },
  {
    title: "Renault Master III — Utilitaire 12 m³",
    marque: "Renault", modele: "Master III", annee: 2010,
    body: "fourgon", priceEUR: 50,
    blurb: "Fourgon 12 m³ à grand volume utile, adapté aux déménagements et au transport de mobilier volumineux.",
    images: [
      `${W}/2/2a/Renault_Master_III_front_20100504.jpg`,
      `${W}/0/0b/Renault_Master_III_rear_20100504.jpg`,
    ],
  },
  {
    title: "Ford Transit — Camion benne",
    marque: "Ford", modele: "Transit", annee: 2010,
    body: "benne", priceEUR: 70,
    blurb: "Camion benne pour l'évacuation de gravats et de déchets de chantier, avec bascule arrière.",
    images: [
      `${W}/7/79/Ford_Transit_VI_Kasten_front_20100301.jpg`,
      `${W}/d/d1/Ford_Transit_VI_Kasten_rear_20100301.jpg`,
    ],
  },
  {
    title: "Renault Master II — Camion benne",
    marque: "Renault", modele: "Master II", annee: 2005,
    body: "benne", priceEUR: 70,
    blurb: "Camion benne basculante, adapté aux chantiers, à l'évacuation de gravats et au transport de matériaux en vrac.",
    images: [
      `${W}/f/f8/Renault_Master_III_phase_3_-_Benne_basculante_-_Ch%C3%A2ssis_simple_cabine_propulsion_-_01.jpg`,
      `${W}/8/8e/Renault_Master_III_phase_3_-_Benne_basculante_-_Ch%C3%A2ssis_simple_cabine_propulsion_-_02.jpg`,
    ],
  },
  {
    title: "Renault Master III — Utilitaire 12 m³ n°2",
    marque: "Renault", modele: "Master III", annee: 2014,
    body: "fourgon", priceEUR: 50,
    blurb: "Fourgon 12 m³ à grand volume utile, adapté aux déménagements et au transport de mobilier volumineux.",
    images: [
      `${W}/b/b1/Renault_Master_III_front_20100501.jpg`,
      `${W}/d/d2/Renault_Master_III_rear_20100501.jpg`,
    ],
  },
  {
    title: "Opel Movano — Utilitaire 12 m³",
    marque: "Opel", modele: "Movano", annee: 2005,
    body: "fourgon", priceEUR: 50,
    blurb: "Fourgon 12 m³ polyvalent, adapté aux déménagements et aux livraisons de gros volumes.",
    images: [
      `${W}/3/32/Opel_Movano_front_20071029.jpg`,
      `${W}/7/78/Opel_Movano_front_20080102.jpg`,
    ],
  },
  {
    title: "Peugeot Boxer — Utilitaire 16 m³ avec hayon",
    marque: "Peugeot", modele: "Boxer", annee: 2004,
    body: "fourgon", priceEUR: 70,
    blurb: "Grand fourgon de 16 m³ équipé d'un hayon élévateur, pour charger seul du mobilier et des charges lourdes sans effort.",
    images: [
      `${W}/8/8e/Peugeot_Boxer_front_20071108.jpg`,
      `${W}/b/b9/Peugeot_Boxer_rear_20071108.jpg`,
    ],
  },
];

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log("Connecté à MongoDB\n");

  // ── 1. Compte partenaire ────────────────────────────────────────────────
  let user = await User.findOne({ $or: [{ email: EMAIL }, { phone: PHONE }] });
  if (user) {
    console.log(`Compte déjà existant : ${user.email} (id=${user._id}) — aucun changement.`);
  } else {
    const hashed = await bcrypt.hash(PASSWORD, 12);
    user = await User.create({
      firstName: "Mohamed Imade",
      lastName: "Dakhlaoui",
      email: EMAIL,
      phone: PHONE,
      password: hashed,
      role: "partenaire",
      partnerActivity: "loueur",
      partnerActivities: ["loueur"],
      entityType: "entreprise",
      country: COUNTRY,
      address: ADRESSE,
      emailVerified: true,
      kycStatus: "VERIFIE",
      certificationBadge: "verifie",
      isActive: true,
      business: { companyName: COMPANY, address: ADRESSE },
    });
    console.log(`Compte partenaire créé : ${user.email} (id=${user._id})`);
    console.log(`Mot de passe temporaire : ${PASSWORD}`);
  }

  // ── 2. Entreprise (PartnerBusiness) ─────────────────────────────────────
  let business = await PartnerBusiness.findOne({ owner: user._id });
  if (business) {
    console.log(`PartnerBusiness déjà existant (id=${business._id}) — aucun changement.`);
  } else {
    business = await PartnerBusiness.create({
      owner: user._id,
      companyName: COMPANY,
      country: COUNTRY,
      ville: VILLE,
      adresse: ADRESSE,
      contactNom: CONTACT_NOM,
      contactTel: PHONE,
      isDefault: true,
      isConcessionnaire: false,
    });
    console.log(`PartnerBusiness créé (id=${business._id})`);
  }

  // ── 3. Flotte ───────────────────────────────────────────────────────────
  let created = 0;
  for (const v of FLEET) {
    const already = await Vehicle.findOne({ owner: user._id, title: v.title });
    if (already) {
      console.log(`  = ${v.title} — déjà en base (id=${already._id})`);
      continue;
    }
    // Prix saisi en EUR, stocké en USD comme partout ailleurs (pivot USD),
    // avec le montant exact conservé pour l'affichage — voir Vehicle.js.
    const priceUSD = await convertAmount(v.priceEUR, "EUR", "USD");
    if (priceUSD == null) throw new Error("Taux EUR introuvable — conversion impossible");

    const doc = await Vehicle.create({
      title: v.title,
      marque: v.marque,
      modele: v.modele,
      annee: v.annee,
      etat: "Bon état",
      type: "location",
      vehicleType: "Utilitaire",
      carburant: "Diesel",
      transmission: "Manuelle",
      nombrePlaces: 3,
      nombrePortes: v.body === "benne" ? 2 : 3,
      climatisation: false,
      pricePerDay: Math.round(priceUSD * 100) / 100,
      pricePerDayEntered: v.priceEUR,
      priceEntryCurrency: "EUR",
      rentalDurationType: "les_deux",
      dureeMinLocation: 1,
      ageMin: 21,
      permisRequis: true,
      conditionsLocation: CONDITIONS,
      contactNom: CONTACT_NOM,
      contactTel: PHONE,
      country: COUNTRY,
      ville: VILLE,
      adresse: ADRESSE,
      images: v.images,
      thumbnail: v.images[0],
      description: `${v.marque} ${v.modele} ${v.annee} en location chez ${COMPANY}, Paris 8e. ${v.blurb} 120 km inclus. Permis de conduire et justificatif de domicile exigés à la prise en charge. Disponible tous les jours.`,
      owner: user._id,
      business: business._id,
      available: true,
      status: "approved",
      statusHistory: [{ status: "approved", changedAt: new Date(), changedBy: null }],
    });
    created++;
    console.log(`  + ${v.title} — ${v.priceEUR} €/j (${doc.pricePerDay} USD) id=${doc._id}`);
  }

  console.log(`\n${created} annonce(s) créée(s) sur ${FLEET.length}.`);
  console.log(`user_id=${user._id}`);
  console.log(`business_id=${business._id}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
