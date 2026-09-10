import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Vehicle from "../models/Vehicle.js";
import { sendEmail } from "../services/communication/channels/EmailChannel.js";
import { partnerCatalogueGapsTemplate } from "../services/communication/templates/email/PartnerCatalogueGaps.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// DEMANDE DES INFORMATIONS QUE LE SITE DU PARTENAIRE NE DONNE PAS
// ═══════════════════════════════════════════════════════════════════════════
// S'adresse à un partenaire dont le catalogue vient d'être aligné sur son site.
// Tout le contenu est CALCULÉ depuis la base : adresses manquantes par ville,
// annonces sans millésime, modèles créés en attente de confirmation, modèles
// qui ne figurent plus sur son site.
//
// Rien n'est écrit à la main. Un e-mail rédigé une fois se désynchronise dès
// que le partenaire corrige une ligne, et finit par lui réclamer ce qu'il a
// déjà fourni — ce qui décrédibilise le reste du message.
//
//   node scripts/requestCatalogueInfo.js <email> [--app-url=https://…] [--confirm]

const CONFIRME = process.argv.includes("--confirm");
const CIBLE = process.argv.slice(2).find((a) => a.includes("@") && !a.startsWith("--"));
const OVERRIDE = process.argv.find((a) => a.startsWith("--app-url="))?.slice("--app-url=".length);
const APP_URL = OVERRIDE || process.env.APP_URL || process.env.FRONTEND_URL || "https://vit-auto.com";
const URL_LOCALE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(APP_URL);

// Une adresse qui ne fait que répéter le nom de la ville (« Agence Marrakech »)
// n'est pas une adresse : c'est une mention d'attente. Le client ne sait
// toujours pas où se présenter.
const adresseInsuffisante = (adresse, ville) => {
  const a = String(adresse || "").trim();
  if (a.length < 12) return true;
  const sansVille = a.toLowerCase().replace(String(ville || "").toLowerCase(), "").replace(/agence|bureau/gi, "").trim();
  return sansVille.replace(/[^a-z0-9]/gi, "").length < 6;
};

async function main() {
  if (!CIBLE) {
    console.error("Usage : node scripts/requestCatalogueInfo.js <email> [--app-url=https://…] [--confirm]");
    process.exit(1);
  }
  if (CONFIRME && URL_LOCALE) {
    console.error(`\n⛔ APP_URL vaut « ${APP_URL} » : le bouton pointerait vers une adresse locale.`
      + `\n   Relancez avec --app-url=https://vit-auto.com\n`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ ENVOI RÉEL" : "\n🔍 SIMULATION — aucun e-mail envoyé (ajouter --confirm)");

  const user = await User.findOne({ email: CIBLE }).lean();
  if (!user) { console.error(`Aucun compte pour ${CIBLE}`); process.exit(1); }
  const business = await PartnerBusiness.findOne({ owner: user._id }).lean();
  const v = await Vehicle.find({ owner: user._id })
    .select("title ville adresse annee status images pricePerDayEntered priceEntryCurrency createdAt contactNom").lean();

  // Villes dont l'adresse ne renseigne rien d'exploitable.
  const parVille = {};
  for (const x of v) {
    const ville = x.ville || "—";
    parVille[ville] = parVille[ville] || { ville, annonces: 0, insuffisante: true };
    parVille[ville].annonces += 1;
    if (!adresseInsuffisante(x.adresse, ville)) parVille[ville].insuffisante = false;
  }
  const villesSansAdresse = Object.values(parVille).filter((c) => c.insuffisante)
    .sort((a, b) => b.annonces - a.annonces).map(({ ville, annonces }) => ({ ville, annonces }));

  // Annonces créées depuis le site du partenaire et encore en modération.
  const nouveaux = v.filter((x) => x.status === "pending" && x.createdAt > new Date(Date.now() - 24 * 3600 * 1000))
    .map((x) => ({ titre: x.title, prix: x.pricePerDayEntered, devise: x.priceEntryCurrency || "MAD" }))
    .filter((x) => x.prix);

  // Annonces restées sur une photo de référence : leur modèle n'a pas été
  // retrouvé sur le site du partenaire.
  // Regroupées par MODÈLE et non par titre : le même véhicule apparaît sous
  // trois graphies héritées de l'import (« KIA Picanto », « KIA PICANTO kech »,
  // « KIA PICANTO »). Les lister toutes donne une liste trois fois trop longue,
  // où le partenaire cherche ce qui les distingue — rien.
  const villesEtBoites = /\b(casa|casablanca|kech|marrakech|tanger|rabat|agadir|fes|nador|oujda|bva|bvm|hl)\b/gi;
  const parModele = new Map();
  for (const x of v.filter((y) => y.images?.[0]?.includes("/reference/"))) {
    const propre = x.title.replace(villesEtBoites, "").replace(/\s+/g, " ").trim();
    // Les lettres doublées sont réduites pour la seule CLÉ de regroupement :
    // l'import a laissé « Jeep Compass » et « JEEP COMPAS », qui ne diffèrent
    // que d'un S. La graphie affichée, elle, reste celle du titre.
    const cle = propre.toUpperCase().replace(/([A-Z])\1+/g, "$1");
    // Garde la graphie la plus lisible (celle qui n'est pas tout en majuscules).
    const actuel = parModele.get(cle);
    if (!actuel || (actuel === actuel.toUpperCase() && propre !== propre.toUpperCase())) parModele.set(cle, propre);
  }
  const aDecider = [...parModele.values()];

  // Plusieurs comptes ont été créés avec la raison sociale en guise de prénom
  // (« Bonjour HORENT »). Le nom du contact enregistré sur l'entité est le seul
  // vrai prénom disponible ; à défaut, aucune interpellation nominative n'est
  // meilleure qu'une fausse.
  // Le nom de contact est cherché sur l'entité PUIS sur les annonces : plusieurs
  // partenaires ne l'ont renseigné qu'à la publication.
  const contactAnnonce = v.find((x) => x.contactNom?.trim())?.contactNom;
  const nomDeContact = (business?.contactNom || contactAnnonce)?.trim().split(/\s+/)[0];
  const prenom = nomDeContact && nomDeContact.toLowerCase() !== (business?.companyName || "").toLowerCase().split(/\s+/)[0]
    ? nomDeContact
    : (user.firstName && user.firstName !== user.firstName.toUpperCase() ? user.firstName : "Partenaire");

  const message = partnerCatalogueGapsTemplate({
    firstName: prenom,
    companyName: business?.companyName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "votre agence",
    annoncesTotal: v.length,
    tarifsCorriges: Number(process.argv.find((a) => a.startsWith("--tarifs="))?.split("=")[1]) || 0,
    villesSansAdresse,
    annoncesSansAnnee: v.filter((x) => !x.annee).length,
    modelesADecider: aDecider,
    nouveauxModeles: nouveaux,
    identifiantsLegauxManquants: true,
    dashboardUrl: `${APP_URL}/vendor/dashboard`,
  });

  console.log(`\n── ${user.firstName} ${user.lastName} <${user.email}>`);
  console.log(`   entité ................. ${business?.companyName || "—"}`);
  console.log(`   annonces ............... ${v.length}`);
  console.log(`   villes sans adresse .... ${villesSansAdresse.map((c) => `${c.ville} (${c.annonces})`).join(", ") || "aucune"}`);
  console.log(`   sans millésime ......... ${v.filter((x) => !x.annee).length}`);
  console.log(`   créés à confirmer ...... ${nouveaux.length}`);
  console.log(`   modèles à décider ...... ${aDecider.length}`);
  console.log(`   objet .................. ${message.subject}`);

  if (!CONFIRME) {
    console.log(`\n──────── VERSION TEXTE ────────\n${message.text}\n───────────────────────────────`);
    console.log("\n══ Simulation terminée — rien n'a été envoyé.");
  } else {
    const r = await sendEmail({
      to: user.email, subject: message.subject,
      html: message.html, text: message.text, userId: String(user._id),
    });
    console.log(r?.success === false ? `\n   ❌ échec : ${r.error}` : "\n   ✅ e-mail envoyé");
  }

  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
