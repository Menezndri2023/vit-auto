import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Activity from "../models/Activity.js";
import { uploadImage, isImageKitConfigured, FOLDERS } from "../config/imagekit.js";
import { getRateFromUSD } from "../services/currencyEngine.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// INTÉGRATION DE NEMO DIVING — PREMIER PARTENAIRE « LOISIRS »
// ═══════════════════════════════════════════════════════════════════════════
// Centre de plongée CMAS & FRMPAS, plage de Belyounech (Fnideq). Gérant Aoudi
// Abderrazak. Toutes les données proviennent de leur site www.nemodiving.ma :
// formules, tarifs, prérequis, adresse, coordonnées GPS, et leurs PROPRES
// photos — jamais d'image de banque, jamais de valeur inventée.
//
// Ce qui n'est PAS sur leur site n'est pas comblé : durée d'une session,
// capacité par sortie, âge minimum, identifiants légaux (RC/ICE/IF). Les
// annonces restent donc en `pending` — l'état par défaut du modèle Activity,
// qui prévoit une revue manuelle — jusqu'à ce que le gérant confirme.
//
// SIMULATION PAR DÉFAUT :
//   node scripts/onboardNemoDiving.js            → simulation
//   node scripts/onboardNemoDiving.js --confirm  → création réelle

const CONFIRME = process.argv.includes("--confirm");

const AGENCE = {
  companyName: "NEMO Diving",
  gerant:      { firstName: "Abderrazak", lastName: "Aoudi" },
  email:       "info@nemodiving.ma",
  phone:       "+212661919565",
  country:     "MA",
  ville:       "Fnideq",
  adresse:     "Plage de Belyounech, Fnideq 93100",
  coordonnees: { lat: 35.9052699, lng: -5.3891661 },
  siteWeb:     "https://www.nemodiving.ma",
};

// Les fichiers de leur galerie sont numérotés sur deux chiffres (01.webp …
// 30.webp) : sans le remplissage, ImageKit reçoit une URL inexistante et
// refuse le téléversement.
const PHOTO = (n) => `https://www.nemodiving.ma/NEMO-Gallery/${String(n).padStart(2, "0")}.webp`;

// Les dix formules telles qu'elles figurent sur nemodiving.ma/packages et sur
// les trois fiches de formation. Prix en dirhams, verbatim.
//
// `durationMinutes` et `capacity` sont volontairement ABSENTS : le site ne les
// donne pour aucune formule. Les laisser aux défauts du modèle (60 min, 1
// place) est un manque visible que le gérant corrigera ; inventer une durée
// créerait de fausses disponibilités et, sur une formation de plusieurs jours,
// autoriserait plusieurs réservations sur un créneau déjà occupé.
//
// Seule exception : le baptême, dont le site précise « Encadrement 1 pour 1 ».
// Sa capacité de 1 est donc une donnée, pas un défaut.
const FORMULES = [
  {
    titre: "Baptême de plongée — première immersion encadrée",
    prixMAD: 400,
    capacite: 1,
    photos: [7, 9, 6],
    description:
      "Votre première plongée, encadrée par un moniteur pour vous seul. La séance "
      + "comprend un temps théorique, une mise en pratique en milieu protégé, puis "
      + "une plongée en mer jusqu'à 6 mètres. Équipement complet fourni. Aucun "
      + "niveau ni prérequis : c'est la formule pour découvrir.\n\n"
      + "Encadrement 1 pour 1. Départ de la plage de Belyounech, à l'endroit où la "
      + "Méditerranée rencontre l'Atlantique.",
  },
  {
    titre: "Plongée exploration — une immersion guidée",
    prixMAD: 550,
    photos: [5, 11, 2],
    description:
      "Une plongée d'exploration sur l'un des sites du Détroit, guidée par un moniteur "
      + "CMAS/FRMPAS. Blocs et plombs fournis, briefing détaillé avant la mise à l'eau.\n\n"
      + "Réservé aux plongeurs déjà brevetés. Présentez votre niveau et votre carnet "
      + "de plongée au centre.",
  },
  {
    titre: "Plongée Nitrox — temps de fond prolongé",
    prixMAD: 700,
    photos: [13, 4, 29],
    description:
      "Une plongée à l'air enrichi, qui allonge le temps de fond et raccourcit les "
      + "paliers. Bloc Nitrox et plombs inclus, guide CMAS/FRMPAS.\n\n"
      + "Brevet Nitrox obligatoire.",
  },
  {
    titre: "Double exploration — deux plongées, deux sites",
    prixMAD: 1000,
    photos: [8, 3, 12],
    description:
      "Deux plongées guidées sur deux sites différents du Détroit, dans la même "
      + "sortie. La formule qui donne la vraie mesure du site : les tombants, les "
      + "gorgones et la faune changent d'un point à l'autre.\n\n"
      + "Réservé aux plongeurs brevetés.",
  },
  {
    titre: "Pack Exploration — 4 plongées",
    prixMAD: 1900,
    photos: [16, 1, 10],
    description:
      "Quatre plongées d'exploration encadrées par un moniteur certifié CMAS. Blocs "
      + "et plombs inclus, collations à bord.\n\n"
      + "Pack valable une semaine. Réservé aux plongeurs brevetés.",
  },
  {
    titre: "Exploration étendue — 6 plongées",
    prixMAD: 2700,
    photos: [30, 14, 17],
    description:
      "Six plongées d'exploration avec guide CMAS/FRMPAS, blocs et plombs inclus, "
      + "briefing détaillé avant chaque immersion.\n\n"
      + "Réservé aux plongeurs brevetés.",
  },
  {
    titre: "Explorateur Pro — 10 plongées",
    prixMAD: 4000,
    photos: [18, 15, 21],
    description:
      "Dix plongées d'exploration, avec priorité sur le choix des sites. Guide "
      + "CMAS/FRMPAS, blocs et plombs inclus.\n\n"
      + "Pack valable un mois. Réservé aux plongeurs brevetés.",
  },
  {
    titre: "Formation CMAS 1 étoile (PE-20)",
    prixMAD: 4800,
    photos: [9, 22, 27],
    description:
      "La formation qui fait de vous un plongeur autonome jusqu'à 20 mètres, encadré. "
      + "Brevet CMAS 1 étoile délivré via la FRMPAS, reconnu internationalement.\n\n"
      + "Durée : 2 à 3 jours. Prérequis : savoir nager 200 mètres.\n"
      + "Inclus : location complète de l'équipement, frais de certification "
      + "CMAS/FRMPAS, carnet et matériel pédagogique, assurance.",
  },
  {
    titre: "Formation CMAS 2 étoiles (PA-20 / PE-40)",
    prixMAD: 7000,
    photos: [13, 23, 25],
    description:
      "Le niveau qui autorise la plongée en autonomie jusqu'à 20 mètres avec un "
      + "partenaire de même niveau, et la plongée encadrée jusqu'à 40 mètres.\n\n"
      + "Durée : 3 jours. Prérequis : plongeur 1 étoile CMAS (PE-20).\n"
      + "Inclus : location complète de l'équipement, frais de certification "
      + "CMAS/FRMPAS, carnet et matériel pédagogique, assurance.",
  },
  {
    titre: "Formation CMAS 3 étoiles — chef de palanquée",
    prixMAD: 9300,
    photos: [2, 20, 26],
    description:
      "Le niveau chef de palanquée : plongée en autonomie jusqu'à 60 mètres et "
      + "encadrement d'une palanquée.\n\n"
      + "Durée : 5 à 7 jours. Prérequis : plongeur 2 étoiles CMAS et 50 plongées "
      + "enregistrées.\n"
      + "Inclus : location complète de l'équipement, frais de certification "
      + "CMAS/FRMPAS, carnet et matériel pédagogique, assurance.",
  },
];

// Mot de passe temporaire : long, aléatoire, sans ambiguïté visuelle (ni O/0
// ni l/I), pour être dicté par téléphone si besoin. Transmis au gérant par un
// canal SÉPARÉ de son adresse e-mail — cette adresse est justement celle du
// compte, l'y envoyer reviendrait à protéger la serrure avec la clé dessus.
function motDePasseTemporaire() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const brut = crypto.randomBytes(18);
  return "Nemo-" + [...brut].map((b) => alphabet[b % alphabet.length]).join("").slice(0, 14);
}

async function main() {
  if (!isImageKitConfigured()) throw new Error("ImageKit non configuré — les photos ne pourraient pas être hébergées.");
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ CRÉATION RÉELLE\n" : "\n🔍 SIMULATION — ajouter --confirm pour créer\n");

  const existant = await User.findOne({ email: AGENCE.email });

  const taux = await getRateFromUSD("MAD");
  const enUSD = (mad) => Math.round((mad / taux) * 100) / 100;

  console.log(`agence ......... ${AGENCE.companyName}`);
  console.log(`gérant ......... ${AGENCE.gerant.firstName} ${AGENCE.gerant.lastName}`);
  console.log(`contact ........ ${AGENCE.email} · ${AGENCE.phone}`);
  console.log(`lieu ........... ${AGENCE.adresse} (${AGENCE.coordonnees.lat}, ${AGENCE.coordonnees.lng})`);
  console.log(`taux MAD/USD ... ${taux}`);
  console.log(`compte existant  ${existant ? "OUI" : "non"}\n`);

  console.log("formules reprises du site :");
  for (const f of FORMULES) {
    console.log(`   ${String(f.prixMAD).padStart(4)} MAD  (${String(enUSD(f.prixMAD)).padStart(7)} USD)  ${f.photos.length} photos  ${f.titre}`);
  }

  if (!CONFIRME) {
    console.log(`\n══ Simulation : 1 compte, 1 entité, ${FORMULES.length} activités, ${new Set(FORMULES.flatMap((f) => f.photos)).size} photos à héberger.`);
    await mongoose.disconnect();
    return;
  }

  // ── Compte du gérant ──────────────────────────────────────────────────────
  // REPRENABLE : un premier passage peut avoir créé le compte puis échoué sur
  // une photo. Refuser d'avancer laisserait un compte orphelin sans annonce, et
  // obligerait à nettoyer à la main. On réutilise donc l'existant, et on ne
  // remet un mot de passe que si le compte vient d'être créé.
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
      // Première utilisation de l'activité "loisirs" (voir constants/partnerTaxonomy.js).
      partnerActivity: "loisirs",
      entityType: "entreprise",
      country:    AGENCE.country,
      ville:      AGENCE.ville,
      isActive:   true,
      // L'adresse vient de leur site public et de leur en-tête de contact :
      // elle est vérifiée de fait. kycStatus et certificationBadge restent en
      // revanche aux valeurs par défaut — aucune pièce n'a été fournie, et les
      // marquer vérifiés serait une affirmation fausse portée par la plateforme.
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
        coordonnees: AGENCE.coordonnees,
        contactNom:  `${AGENCE.gerant.lastName} ${AGENCE.gerant.firstName}`,
        contactTel:  AGENCE.phone,
        isDefault:   true,
      },
    },
    { upsert: true, new: true }
  );
  console.log(`✓ compte ${user.email}${motDePasse ? "" : "  (déjà existant, mot de passe inchangé)"}\n✓ entité ${business.companyName}\n`);

  // ── Photos : les leurs, hébergées chez nous ───────────────────────────────
  // Rapatriées plutôt que pointées : un lien direct vers leur site casserait à
  // la première refonte, et ferait porter leur bande passante par nos visiteurs.
  const cache = new Map();
  async function heberger(n) {
    if (cache.has(n)) return cache.get(n);
    const r = await uploadImage(PHOTO(n), {
      folder: FOLDERS.activities,
      fileName: `nemo_diving_${String(n).padStart(2, "0")}.webp`,
      tags: ["nemo-diving", "plongee"],
    });
    if (!r?.url) throw new Error(`échec du téléversement de la photo ${n}`);
    cache.set(n, r.url);
    await new Promise((res) => setTimeout(res, 300));
    return r.url;
  }

  let creees = 0, deja = 0;
  for (const f of FORMULES) {
    // Reprise après un échec en cours de route : une formule déjà créée n'est
    // pas dupliquée, et ses photos ne sont pas re-téléversées.
    if (await Activity.exists({ owner: user._id, title: f.titre })) {
      deja += 1;
      console.log(`   · ${String(f.prixMAD).padStart(4)} MAD  ${f.titre}  (déjà en base)`);
      continue;
    }
    const images = [];
    for (const n of f.photos) images.push(await heberger(n));

    const a = await Activity.create({
      owner:    user._id,
      business: business._id,
      activityType: "PLONGEE",
      title:       f.titre,
      description: f.description,
      price:       enUSD(f.prixMAD),
      priceUnit:   "per_person",
      currency:           "MAD",
      priceEntered:       f.prixMAD,
      priceEntryCurrency: "MAD",
      // Seul le baptême a une capacité connue (« encadrement 1 pour 1 »).
      ...(f.capacite ? { capacity: f.capacite } : {}),
      images,
      thumbnail: images[0],
      country:   AGENCE.country,
      ville:     AGENCE.ville,
      adresse:   AGENCE.adresse,
      coordonnees: AGENCE.coordonnees,
      // Défaut du modèle : revue manuelle par un administrateur. La durée de
      // séance et la capacité manquent encore — voir l'en-tête de ce fichier.
      status: "pending",
    });
    creees += 1;
    console.log(`   ✓ ${String(f.prixMAD).padStart(4)} MAD  ${a.title}`);
  }

  console.log(`\n══ ${creees} activités créées${deja ? `, ${deja} déjà présentes` : ""}, ${cache.size} photos hébergées.`);
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
