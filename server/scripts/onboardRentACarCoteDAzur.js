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
// INTÉGRATION DE RENT À CAR CÔTE D'AZUR (Nice, France) — 2026-09-16
// ═══════════════════════════════════════════════════════════════════════════
// Agence de location, responsable Aleksandr Yanovskiy. Tout est relevé sur
// rentacar.bitrix24.site : onze véhicules avec tarif jour et tarif semaine,
// année, boîte et équipements tels qu'ils les décrivent, et leurs propres
// photos (avant/arrière prises sur leur parking). Les conditions viennent de
// la partie française de leur page (caution 1 000 € en espèces, 21 ans,
// permis depuis au moins un an, 100 km inclus par jour, kilométrage illimité
// à +20 €/jour, livraison aéroport de Nice 60 € par trajet, annulation).
//
// Ce que leur site ne dit pas n'est pas comblé : année de l'Evoque, de la
// Classe E, de la Classe A et de la Série 5 M ; carburant de la Série 5 M ;
// boîte de la Classe E indiquée « BVA » donc automatique. Les sections
// « 800 EUR par mois » et les cartes de modèle (Audi, Jaguar, 206 CC) restent
// hors périmètre : prix contradictoires ou gabarits non remplis.
//
//   node scripts/onboardRentACarCoteDAzur.js <dossier-photos>            → simulation
//   node scripts/onboardRentACarCoteDAzur.js <dossier-photos> --confirm  → création

const CONFIRME = process.argv.includes("--confirm");
const DOSSIER  = process.argv.slice(2).find((a) => !a.startsWith("--"));

const AGENCE = {
  companyName: "RENT À CAR CÔTE D'AZUR",
  gerant: { firstName: "Aleksandr", lastName: "Yanovskiy" },
  email: "rentacarcotedazur06@gmail.com",     // compte VIT AUTO (donné par l'exploitant)
  emailAgence: "yanovskiylocations@yandex.com", // contact affiché sur leur site
  phone: "+33767711040",
  country: "FR",
  ville: "Nice",
  adresse: "18 rue Chabrier, 06300 Nice",
  stationnement: "10 boulevard de l'Armée des Alpes, 06300 Nice",
  // 10 bd de l'Armée des Alpes, Nice (quartier Pasteur) — point de remise.
  coordonnees: { lat: 43.7146, lng: 7.2905 },
  siteWeb: "https://rentacar.bitrix24.site/",
  description: "Agence de location de voitures à Nice, ouverte 24h/24 et 7j/7 : citadines, berlines, cabriolets et SUV premium (BMW, Mercedes-Benz, Porsche, Range Rover). "
    + "Livraison à la gare de Nice, à l'aéroport Nice Côte d'Azur, à Cannes et à Monaco. Location avec chauffeur, transferts et excursions sur demande.",
};

// Relevé sur la partie française de leur page.
const CONDITIONS = {
  ageMinimum: 21,
  ancienneteDuPermisAnnees: 1,
  cautionEUR: 1000,
  kmInclusParJour: 100,
  politiqueAnnulation: "Annulation entre 72 h et 24 h avant le départ : 50 % du montant de la location. Moins de 24 h avant, ou absence au rendez-vous : 100 %.",
  autresExigences:
    "Permis de conduire au nom du conducteur principal, détenu depuis au moins un an sans infraction majeure, et pièce d'identité officielle avec photo (passeport ou carte d'identité). "
    + "Conducteurs hors Union européenne : permis international ou traduction certifiée. Âge maximum du conducteur : 75 ans. "
    + "Caution de 1 000 € bloquée en espèces, restituée au retour du véhicule sans péage, amende ni carburant manquant. "
    + "100 km inclus par jour ; kilométrage illimité en option (+20 € par jour ou 0,15 € par km). "
    + "Livraison et restitution : gare de Nice, aéroport Nice Côte d'Azur (60 € par trajet, 120 € entre 19 h et 8 h), Cannes et Monaco (160 € par trajet entre 19 h et 8 h). "
    + "Conducteur additionnel 10 € par jour ; siège enfant ou rehausseur 30 € par location. Paiement en espèces ou par carte. "
    + "Circulation transfrontalière limitée à l'espace Schengen.",
};

// Parc relevé le 2026-09-16 (section « COMMANDE » de leur page : tarif jour
// et tarif semaine). Le tarif semaine devient une remise « dès 7 jours »
// exactement équivalente à leur prix affiché.
const PARC = [
  { code: "bmw-x5-m",        titre: "BMW X5 M",                         marque: "BMW",           modele: "X5 M",              annee: 2018, prixJour: 170, prixSemaine: 900, type: "SUV",       boite: "Automatique", carburant: "Essence", places: 7, portes: 5,
    desc: "BMW X5 M xDrive 2018, boîte automatique, 7 places. Multimédia complet : 3 écrans, PC, TV, DVD, Bluetooth — toutes les options du modèle." },
  { code: "bmw-530d-gt",     titre: "BMW 530d Gran Turismo",            marque: "BMW",           modele: "530d GT",           annee: 2017, prixJour: 100, prixSemaine: 650, type: "Berline",   boite: "Automatique", carburant: "Diesel",  places: 5, portes: 5,
    desc: "BMW 530d GT 2017, boîte automatique 8 rapports Tiptronic, GPS, cuir chauffant, caméra de recul, toit panoramique, USB, AUX, Bluetooth." },
  { code: "porsche-cayenne-s", titre: "Porsche Cayenne S",              marque: "Porsche",       modele: "Cayenne S",         annee: 2009, prixJour: 90,  prixSemaine: 450, type: "SUV",       boite: "Automatique", carburant: "Essence", places: 5, portes: 5,
    desc: "Porsche Cayenne S modèle Sport 2009, boîte automatique, GPS, cuir chauffant, son Bose hi-fi, toit panoramique." },
  { code: "range-rover-evoque", titre: "Range Rover Evoque V6 Diesel",  marque: "Land Rover",    modele: "Range Rover Evoque", annee: null, prixJour: 150, prixSemaine: 800, type: "SUV",      boite: "Automatique", carburant: "Diesel",  places: 5, portes: 5,
    desc: "Range Rover Evoque V6 diesel, boîte automatique, GPS, cuir chauffant, TV, USB, AUX, MP3, Bluetooth." },
  { code: "mercedes-clk-cabriolet", titre: "Mercedes-Benz CLK 200 Kompressor Cabriolet", marque: "Mercedes-Benz", modele: "CLK 200 Kompressor Cabriolet", annee: 2009, prixJour: 65, prixSemaine: 320, type: "Cabriolet", boite: "Automatique", carburant: "Essence", places: 4, portes: 2,
    desc: "Mercedes-Benz CLK 200 Kompressor cabriolet 2009, boîte automatique, capote électrique, GPS 3D, USB, sièges cuir ventilés, Bluetooth." },
  { code: "mercedes-cls-brabus", titre: "Mercedes-Benz CLS 320 CDI Brabus", marque: "Mercedes-Benz", modele: "CLS 320 CDI Brabus", annee: 2011, prixJour: 75, prixSemaine: 400, type: "Berline", boite: "Automatique", carburant: "Diesel", places: 5, portes: 4,
    desc: "Mercedes-Benz CLS 320 CDI Brabus 2011, boîte automatique 7G-Tronic, GPS, AUX, chargeur 6 CD, MP3, USB, cuir chauffant, réfrigérateur, Bluetooth." },
  { code: "mercedes-classe-e", titre: "Mercedes-Benz Classe E 200 CDI",  marque: "Mercedes-Benz", modele: "Classe E 200 CDI",  annee: null, prixJour: 85,  prixSemaine: 550, type: "Berline",   boite: "Automatique", carburant: "Diesel",  places: 5, portes: 4,
    desc: "Mercedes-Benz Classe E 200 CDI, boîte automatique 7G-Tronic, économique et confortable, GPS, AUX, USB." },
  { code: "bmw-118d-m",      titre: "BMW Série 1 118d M Sport",         marque: "BMW",           modele: "118d M Sport",      annee: 2009, prixJour: 55,  prixSemaine: 300, type: "Citadine",  boite: "Manuelle",    carburant: "Diesel",  places: 5, portes: 5,
    desc: "BMW 118d M Sport 2009, boîte manuelle 6 rapports, AUX, CD, USB — très économique (4 à 5 l/100 km)." },
  { code: "mercedes-classe-a", titre: "Mercedes-Benz Classe A 150",      marque: "Mercedes-Benz", modele: "Classe A 150",      annee: null, prixJour: 50,  prixSemaine: 280, type: "Citadine",  boite: "Automatique", carburant: "GPL",     places: 5, portes: 5,
    desc: "Mercedes-Benz Classe A 150 bicarburation essence/GPL, boîte automatique, AUX, CD — économique." },
  { code: "mercedes-clk-coupe", titre: "Mercedes-Benz CLK 200 Kompressor Coupé", marque: "Mercedes-Benz", modele: "CLK 200 Kompressor Coupé", annee: 2008, prixJour: 50, prixSemaine: 250, type: "Berline", boite: "Manuelle", carburant: "Essence", places: 4, portes: 2,
    desc: "Mercedes-Benz CLK 200 Kompressor coupé 2008, boîte manuelle 6 rapports, climatisation, chargeur 6 CD." },
  { code: "bmw-serie-5-m",   titre: "BMW Série 5 M Sport",              marque: "BMW",           modele: "Série 5 M Sport",   annee: null, prixJour: 65,  prixSemaine: 350, type: "Berline",   boite: "Automatique", carburant: null,      places: 5, portes: 4,
    desc: "BMW Série 5 M Sport, boîte automatique, phares xénon, TV, DVD, GPS, AUX." },
];

const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function motDePasseTemporaire() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return "Azur-" + [...crypto.randomBytes(16)].map((b) => alphabet[b % alphabet.length]).join("").slice(0, 12);
}

async function televerser(chemin, dossier, nom, tags) {
  const ext = chemin.split(".").pop().toLowerCase();
  const b64 = fs.readFileSync(chemin).toString("base64");
  const img = await uploadImage(`data:${MIMES[ext] || "image/jpeg"};base64,${b64}`, { folder: dossier, fileName: nom, tags });
  if (!img?.url) throw new Error(`échec du téléversement : ${chemin}`);
  return img.url;
}

async function main() {
  if (!DOSSIER || !fs.existsSync(DOSSIER)) {
    console.error("Usage : node scripts/onboardRentACarCoteDAzur.js <dossier-photos> [--confirm]");
    process.exit(1);
  }
  if (!isImageKitConfigured()) throw new Error("ImageKit non configuré.");
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ CRÉATION RÉELLE\n" : "\n🔍 SIMULATION — ajouter --confirm pour créer\n");

  const taux = await getRateFromUSD("EUR");
  const enUSD = (eur) => Math.round((eur / taux) * 100) / 100;
  const existant = await User.findOne({ email: AGENCE.email });
  console.log(`agence ......... ${AGENCE.companyName}`);
  console.log(`responsable .... ${AGENCE.gerant.firstName} ${AGENCE.gerant.lastName} · ${AGENCE.phone}`);
  console.log(`compte ......... ${AGENCE.email} ${existant ? "(EXISTE DÉJÀ)" : "(à créer)"}`);
  console.log(`taux EUR/USD ... 1 USD = ${taux} EUR\n`);
  for (const v of PARC) {
    const remise = Math.round((1 - v.prixSemaine / (v.prixJour * 7)) * 100);
    const photos = [0, 1].map((j) => `${DOSSIER}/${String(PARC.indexOf(v) + 1).padStart(2, "0")}-${j}.jpg`).filter(fs.existsSync);
    console.log(`   ${String(v.prixJour).padStart(3)} €/j  ${String(v.prixSemaine).padStart(4)} €/sem (−${remise} %)  ${v.titre.padEnd(44)} ${v.type}/${v.boite}/${v.carburant || "?"} ${v.annee || "année ?"}  ${photos.length} photo(s)`);
  }
  if (!CONFIRME) {
    console.log(`\n══ Simulation : 1 compte, 1 entité, ${PARC.length} annonces publiées en EUR, ${PARC.length * 2 + 1} images à héberger.`);
    await mongoose.disconnect(); return;
  }

  let motDePasse = null;
  let user = existant;
  const logoUrl = fs.existsSync(`${DOSSIER}/logo-carre.jpg`)
    ? await televerser(`${DOSSIER}/logo-carre.jpg`, FOLDERS.avatars, "rentacar-cote-dazur.jpg", ["rentacar-azur", "partenaire"])
    : null;
  if (!user) {
    motDePasse = motDePasseTemporaire();
    user = await User.create({
      firstName: AGENCE.gerant.firstName, lastName: AGENCE.gerant.lastName,
      email: AGENCE.email, password: await bcrypt.hash(motDePasse, 10), phone: AGENCE.phone,
      role: "partenaire", partnerActivity: "loueur", entityType: "entreprise", sellerType: "entreprise", partnerCategory: "entreprise",
      country: AGENCE.country, isActive: true, emailVerified: true,
      profilePhoto: logoUrl,
      business: { companyName: AGENCE.companyName, address: AGENCE.adresse, logo: logoUrl, description: AGENCE.description, website: AGENCE.siteWeb },
      defaultLocation: { address: AGENCE.adresse, city: AGENCE.ville, lat: AGENCE.coordonnees.lat, lng: AGENCE.coordonnees.lng },
      // Même décision que pour NEMO Diving / Boyzone : activité vérifiée sur
      // leur site, publication ouverte sans échéance en attendant les pièces.
      provisionalPublishing: { granted: true, grantedAt: new Date(), reason: "Agence vérifiée sur son site officiel (rentacar.bitrix24.site) ; publication ouverte jusqu'à retrait explicite." },
    });
  }

  const business = await PartnerBusiness.findOneAndUpdate(
    { owner: user._id, companyName: AGENCE.companyName },
    { $setOnInsert: {
      owner: user._id, companyName: AGENCE.companyName, country: AGENCE.country, ville: AGENCE.ville, adresse: AGENCE.adresse,
      coordonnees: AGENCE.coordonnees, contactNom: `${AGENCE.gerant.firstName} ${AGENCE.gerant.lastName}`, contactTel: AGENCE.phone, isDefault: true,
    } },
    { upsert: true, new: true }
  );
  business.rentalPolicy.minimumAge                  = CONDITIONS.ageMinimum;
  business.rentalPolicy.minimumLicenseYears         = CONDITIONS.ancienneteDuPermisAnnees;
  business.rentalPolicy.identityDocumentRequired    = true;
  business.rentalPolicy.drivingLicenseRequired      = true;
  business.rentalPolicy.internationalLicenseRequired = false;
  business.rentalPolicy.depositRequired             = true;
  business.rentalPolicy.additionalRequirements      = CONDITIONS.autresExigences;
  // Chauffeur, siège enfant et GPS annoncés ; le conducteur additionnel et le
  // siège enfant sont tarifés par eux (10 €/j, 30 €/location) mais notre
  // grille ne connaît que le tarif journalier : chauffeur/siège/GPS proposés au
  // tarif global, assurance incluse (CDW) donc non proposée en option payante.
  business.rentalPolicy.rentalOptions.driver.offered   = true;
  business.rentalPolicy.rentalOptions.babySeat.offered = true;
  business.rentalPolicy.rentalOptions.gps.offered      = true;
  business.rentalPolicy.rentalOptions.insurance.offered = false;
  await business.save();
  console.log(`✓ compte ${user.email}${motDePasse ? "" : "  (déjà existant)"}\n✓ entité ${business.companyName}${logoUrl ? "\n✓ logo hébergé" : ""}\n`);

  let creees = 0;
  for (const [i, v] of PARC.entries()) {
    if (await Vehicle.exists({ owner: user._id, title: v.titre })) { console.log(`   · ${v.titre} (déjà en base)`); continue; }
    const images = [];
    for (const j of [0, 1]) {
      const chemin = `${DOSSIER}/${String(i + 1).padStart(2, "0")}-${j}.jpg`;
      if (!fs.existsSync(chemin)) continue;
      images.push(await televerser(chemin, `${FOLDERS.vehicles}/rentacar-azur`, `${v.code}-${j + 1}.jpg`, ["rentacar-azur", "catalogue-partenaire"]));
    }
    if (!images.length) throw new Error(`aucune photo pour ${v.titre}`);
    const remise = Math.round((1 - v.prixSemaine / (v.prixJour * 7)) * 100);
    await Vehicle.create({
      owner: user._id, business: business._id,
      title: v.titre, marque: v.marque, modele: v.modele, ...(v.annee ? { annee: v.annee } : {}),
      type: "location", vehicleType: v.type,
      ...(v.boite ? { transmission: v.boite } : {}), ...(v.carburant ? { carburant: v.carburant } : {}),
      nombrePlaces: v.places, nombrePortes: v.portes, climatisation: true,
      description: v.desc,
      pricePerDay: enUSD(v.prixJour), pricePerDayEntered: v.prixJour, priceEntryCurrency: "EUR", currency: "EUR",
      caution: enUSD(CONDITIONS.cautionEUR), cautionEntered: CONDITIONS.cautionEUR,
      promotions: remise > 0 ? [{ type: "percent", value: remise, minDays: 7, label: `Tarif semaine : ${v.prixSemaine} € les 7 jours`, active: true }] : [],
      images, thumbnail: images[0],
      ville: AGENCE.ville, adresse: AGENCE.stationnement, country: AGENCE.country, coordonnees: AGENCE.coordonnees,
      contactNom: business.contactNom, contactTel: AGENCE.phone,
      ageMin: CONDITIONS.ageMinimum, permisRequis: true,
      insuranceIncluded: true,
      cancellationPolicy: CONDITIONS.politiqueAnnulation,
      status: "approved", available: true,
    });
    creees += 1;
    console.log(`   ✓ ${String(v.prixJour).padStart(3)} €/j  ${v.titre}  (${images.length} photos, −${remise} % dès 7 j)`);
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
