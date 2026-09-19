import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Activity from "../models/Activity.js";
import { uploadImage, isImageKitConfigured, FOLDERS } from "../config/imagekit.js";
import { getRateFromUSD } from "../services/currencyEngine.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// INTÉGRATION D'AGADIR QUAD & BUGGY EXPERIENCE — PARTENAIRE « LOISIRS »
// ═══════════════════════════════════════════════════════════════════════════
// Excursion quad transmise directement par le gérant (Bouaddi Mohamed) —
// aucune donnée inventée. Le point de départ réel est Takat (Sidi Bibi), mais
// la communication/SEO doit rester sur "Agadir" (zone touristique où le
// transport est proposé) — précision explicite du gérant.
//
// ⚠️ Tarif à deux paliers selon le partage du quad (300 MAD/pers. seul, 200
// MAD/pers. à deux) — le modèle Activity n'a qu'un seul champ `price`, et la
// capacité de créneau (Booking.activite, bookingController.js) est vérifiée
// PAR ANNONCE : créer deux annonces (solo/duo) avec capacity=10 chacune
// permettrait 20 participants sur un même créneau au lieu de 10. Une seule
// annonce est donc créée, au tarif le plus élevé (300 MAD, jamais de
// sous-facturation), la remise duo étant décrite en texte. À corriger
// proprement si un vrai palier de prix par occupation de quad est construit.
//
// Aucune photo de l'activité fournie pour l'instant (uniquement le logo de
// l'entreprise, non représentatif de l'expérience réelle) — images laissées
// vides, à compléter dès réception.
//
// SIMULATION PAR DÉFAUT :
//   node scripts/onboardAgadirQuad.js            → simulation
//   node scripts/onboardAgadirQuad.js --confirm  → création réelle

const CONFIRME = process.argv.includes("--confirm");

const AGENCE = {
  companyName: "Agadir Quad & Buggy Experience",
  gerant:      { firstName: "Mohamed", lastName: "Bouaddi" },
  email:       "agadirquadexperience@gmail.com",
  phone:       "+212605006461",
  country:     "MA",
  ville:       "Agadir",
  adresse:     "Takat, Sidi Bibi (point de rassemblement) — transport aller-retour depuis Agadir disponible",
};

// Chemin de scratch éphémère (image collée dans la conversation) — le script
// n'est donc rejouable qu'une fois : une fois le logo hébergé sur ImageKit
// (voir plus bas), ce chemin local peut disparaître sans conséquence.
const LOGO_PATH = "/Users/mac/tmp-claude/claude-501/-Users-mac-vit-auto/62abde0e-dec7-4b23-9a4d-4fd7742620e0/images/1.png";

const ACTIVITE = {
  titre: "Excursion en Quad – Dunes, Plage & Sandboard",
  prixMAD: 300, // tarif quad individuel (1 pers./quad) — voir note ci-dessus pour le tarif duo (200 MAD/pers.)
  dureeMinutes: 120,
  capacite: 10, // "10 personne chaque 2 heures" — donnée du gérant, pas un défaut
  description:
    "Départ depuis notre point d'activité à Takat (Sidi Bibi), avec transport aller-retour "
    + "possible depuis la zone touristique d'Agadir. Parcours tout-terrain à travers pistes et "
    + "chemins naturels de la région, puis vers la côte et les dunes de sable — paysages variés "
    + "entre pistes, nature, plage et désert.\n\n"
    + "Pause dans les dunes : thé marocain, petites douceurs, et sandboard offert. Arrêts photo "
    + "prévus en chemin. Retour au point de départ par les pistes.\n\n"
    + "Durée : environ 2 heures. Départs à 09h00, 11h00, 13h00 et 16h00.\n\n"
    + "Tarifs : 300 MAD/personne en quad individuel (1 pers./quad) · 200 MAD/personne en quad "
    + "partagé (2 pers./quad) — précisez votre choix à la réservation.\n\n"
    + "Inclus : 2h de quad, casque et équipement de sécurité, sandboard, thé marocain, petites "
    + "douceurs, pause photo, transport aller-retour depuis l'hôtel ou le point de rendez-vous.\n\n"
    + "Non inclus : dépenses personnelles, toute activité ou service non mentionné ci-dessus.\n\n"
    + "Conditions : les enfants peuvent participer selon leur âge, accompagnés d'un adulte ou du "
    + "guide. Consignes de sécurité du guide à respecter à tout moment.\n\n"
    + "Transport organisé avec des prestataires touristiques partenaires, selon disponibilité.\n\n"
    + "Annulation gratuite jusqu'à 24h avant l'activité ; au-delà (ou non-présentation), des frais "
    + "peuvent s'appliquer selon les conditions de réservation.",
};

function motDePasseTemporaire() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const brut = crypto.randomBytes(18);
  return "Agadir-" + [...brut].map((b) => alphabet[b % alphabet.length]).join("").slice(0, 14);
}

async function main() {
  if (!isImageKitConfigured()) throw new Error("ImageKit non configuré — le logo ne pourrait pas être hébergé.");
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Logo introuvable : ${LOGO_PATH}`);

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ CRÉATION RÉELLE\n" : "\n🔍 SIMULATION — ajouter --confirm pour créer\n");

  const existant = await User.findOne({ email: AGENCE.email });

  const taux = await getRateFromUSD("MAD");
  const enUSD = (mad) => Math.round((mad / taux) * 100) / 100;

  console.log(`agence ......... ${AGENCE.companyName}`);
  console.log(`gérant ......... ${AGENCE.gerant.firstName} ${AGENCE.gerant.lastName}`);
  console.log(`contact ........ ${AGENCE.email} · ${AGENCE.phone}`);
  console.log(`lieu ........... ${AGENCE.adresse}`);
  console.log(`taux MAD/USD ... ${taux}`);
  console.log(`compte existant  ${existant ? "OUI" : "non"}\n`);
  console.log(`activité : ${ACTIVITE.prixMAD} MAD (${enUSD(ACTIVITE.prixMAD)} USD) — ${ACTIVITE.titre}`);

  if (!CONFIRME) {
    console.log(`\n══ Simulation : 1 compte, 1 entité, 1 activité, 1 logo à héberger.`);
    await mongoose.disconnect();
    return;
  }

  // ── Compte du gérant (reprenable — voir onboardNemoDiving.js) ─────────────
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
      partnerActivity: "loisirs",
      entityType: "entreprise",
      country:    AGENCE.country,
      ville:      AGENCE.ville,
      isActive:   true,
      emailVerified: true,
    });
  }

  const business = await PartnerBusiness.findOneAndUpdate(
    { owner: user._id, companyName: AGENCE.companyName },
    {
      $setOnInsert: {
        owner:       user._id,
        companyName: AGENCE.companyName,
        country:     AGENCE.country,
        ville:       AGENCE.ville,
        adresse:     AGENCE.adresse,
        contactNom:  `${AGENCE.gerant.lastName} ${AGENCE.gerant.firstName}`,
        contactTel:  AGENCE.phone,
        isDefault:   true,
      },
    },
    { upsert: true, new: true }
  );

  // ── Logo (User.business.logo) ──────────────────────────────────────────
  if (!user.business?.logo) {
    const buf = fs.readFileSync(LOGO_PATH);
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
    const logo = await uploadImage(dataUri, {
      folder: FOLDERS.partners,
      fileName: "agadir_quad_logo.png",
      tags: ["agadir-quad-buggy", "logo"],
    });
    if (!logo?.url) throw new Error("échec du téléversement du logo");
    user.business = { ...(user.business?.toObject?.() || user.business || {}), companyName: AGENCE.companyName, address: AGENCE.adresse, logo: logo.url };
    await user.save();
  }

  console.log(`✓ compte ${user.email}${motDePasse ? "" : "  (déjà existant, mot de passe inchangé)"}\n✓ entité ${business.companyName}\n✓ logo ${user.business?.logo ? "hébergé" : "(déjà présent)"}\n`);

  // ── Activité ────────────────────────────────────────────────────────────
  let activite = await Activity.findOne({ owner: user._id, title: ACTIVITE.titre });
  if (activite) {
    console.log(`   · ${ACTIVITE.titre}  (déjà en base)`);
  } else {
    activite = await Activity.create({
      owner:    user._id,
      business: business._id,
      activityType: "QUAD",
      title:       ACTIVITE.titre,
      description: ACTIVITE.description,
      price:       enUSD(ACTIVITE.prixMAD),
      priceUnit:   "per_person",
      currency:           "MAD",
      priceEntered:       ACTIVITE.prixMAD,
      priceEntryCurrency: "MAD",
      durationMinutes: ACTIVITE.dureeMinutes,
      capacity:        ACTIVITE.capacite,
      images: [],
      country: AGENCE.country,
      ville:   AGENCE.ville,
      adresse: AGENCE.adresse,
      // Défaut du modèle : revue manuelle par un administrateur.
      status: "pending",
    });
    console.log(`   ✓ ${ACTIVITE.prixMAD} MAD  ${activite.title}`);
  }

  console.log(`\n══ Intégration terminée.`);
  if (motDePasse) {
    console.log(`\n🔑 Mot de passe temporaire de ${AGENCE.email} :\n\n      ${motDePasse}\n`);
    console.log("   À transmettre par WhatsApp ou SMS — jamais par e-mail à cette");
    console.log("   même adresse, qui est celle du compte.");
  } else {
    console.log("\n(Compte préexistant : mot de passe laissé intact.)");
  }

  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
