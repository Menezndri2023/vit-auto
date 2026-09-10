import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Vehicle from "../models/Vehicle.js";
import { sendEmail } from "../services/communication/channels/EmailChannel.js";
import { partnerFleetCompletionTemplate } from "../services/communication/templates/email/PartnerFleetCompletion.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// RELANCE D'UN PARTENAIRE DE LOCATION SUR SA FLOTTE INCOMPLÈTE
// ═══════════════════════════════════════════════════════════════════════════
// Pendant de scripts/notifyExporters.js, pour le métier location.
//
// Le contenu est CALCULÉ depuis la base, jamais rédigé à la main : la liste des
// véhicules en brouillon et le détail de ce qui manque à chacun sortent des
// documents eux-mêmes. Un e-mail rédigé à la main vieillit dès que le
// partenaire corrige une ligne, et finit par lui reprocher un manque déjà
// comblé — ce qui décrédibilise tout le message.
//
// SIMULATION PAR DÉFAUT. Un e-mail part vers une personne réelle et ne se
// rattrape pas : rien n'est envoyé sans `--confirm`.
//
//   node scripts/notifyRentalPartner.js <email>            → simulation
//   node scripts/notifyRentalPartner.js <email> --confirm  → envoi réel

const CONFIRME = process.argv.includes("--confirm");
const CIBLE = process.argv.slice(2).find((a) => a.includes("@") && !a.startsWith("--"));
const OVERRIDE = process.argv.find((a) => a.startsWith("--app-url="))?.slice("--app-url=".length);
const APP_URL = OVERRIDE || process.env.APP_URL || process.env.FRONTEND_URL || "https://vit-auto.com";

// Ce script s'exécute depuis un poste de développement, où APP_URL vaut
// http://localhost:5173. Sans ce garde-fou, le bouton « Compléter ma flotte »
// part vers localhost : un lien mort chez le destinataire, et un e-mail de
// relance qu'on ne peut pas rattraper. La simulation, elle, laisse passer —
// c'est justement là qu'on veut voir l'URL telle qu'elle est configurée.
const URL_LOCALE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(APP_URL);

// Champs dont l'absence n'empêche pas la publication mais prive l'annonce des
// filtres du catalogue. `annee` et le tarif sont traités à part : eux seuls
// distinguent un véhicule « en attente du partenaire » d'un véhicule complet.
const CONFORT = [
  ["carburant",    "le carburant"],
  ["transmission", "la transmission"],
  ["couleur",      "la couleur"],
  ["description",  "une description"],
];

function manquesDe(v) {
  const m = [];
  if (!v.annee) m.push("le millésime");
  if (!v.pricePerDayEntered || v.pricePerDayEntered <= 0) m.push("le tarif journalier");
  if (!v.dureeMinLocation || v.dureeMinLocation < 1) m.push("la durée minimale");
  for (const [champ, libelle] of CONFORT) if (!v[champ]) m.push(libelle);
  return m;
}

async function main() {
  if (!CIBLE) {
    console.error("Usage : node scripts/notifyRentalPartner.js <email-du-partenaire> [--app-url=https://…] [--confirm]");
    process.exit(1);
  }
  if (CONFIRME && URL_LOCALE) {
    console.error(
      `\n⛔ APP_URL vaut « ${APP_URL} » : le bouton de l'e-mail pointerait vers une adresse locale,`
      + `\n   injoignable pour le destinataire. Relancez avec --app-url=https://vit-auto.com\n`
    );
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ ENVOI RÉEL" : "\n🔍 SIMULATION — aucun e-mail envoyé (ajouter --confirm)");

  const user = await User.findOne({ email: CIBLE }).select("firstName lastName email").lean();
  if (!user) { console.error(`Aucun compte pour ${CIBLE}`); process.exit(1); }

  const business = await PartnerBusiness.findOne({ owner: user._id }).select("companyName").lean();
  const flotte = await Vehicle.find({ owner: user._id })
    .select("title status annee pricePerDayEntered priceEntryCurrency dureeMinLocation carburant transmission couleur description images")
    .lean();

  if (!flotte.length) { console.error("Ce partenaire n'a aucun véhicule — rien à relancer."); process.exit(1); }

  const publiees = flotte
    .filter((v) => v.status === "approved")
    .sort((a, b) => (b.pricePerDayEntered || 0) - (a.pricePerDayEntered || 0))
    .map((v) => ({
      titre: v.title,
      prix: v.pricePerDayEntered,
      devise: v.priceEntryCurrency || "USD",
      dureeMin: v.dureeMinLocation || 1,
    }));

  // Un manque n'est « commun » que s'il touche TOUTE la flotte : le citer alors
  // qu'un seul véhicule est concerné ferait douter le partenaire du reste du
  // message.
  const manquesCommuns = CONFORT
    .filter(([champ]) => flotte.every((v) => !v[champ]))
    .map(([, libelle]) => libelle);

  // Les manques communs sont retirés du détail par véhicule : les répéter aux
  // deux endroits donne une liste qui semble accablante et noie ce qui est
  // PROPRE à ces véhicules-là — leur millésime et leur tarif, le seul motif
  // pour lequel ils sont restés en brouillon.
  const communs = new Set(manquesCommuns);
  const brouillons = flotte
    .filter((v) => v.status === "draft")
    .map((v) => ({ titre: v.title, manques: manquesDe(v).filter((m) => !communs.has(m)) }))
    .filter((v) => v.manques.length);

  // Photos de référence posées par la plateforme faute de photos réelles : elles
  // pointent vers un dépôt externe, jamais vers notre stockage ni vers un envoi
  // du partenaire. C'est le marqueur le plus fiable dont on dispose.
  const photosProvisoires = flotte.some((v) =>
    (v.images || []).some((u) => typeof u === "string" && u.includes("wikimedia.org"))
  );

  const message = partnerFleetCompletionTemplate({
    firstName: user.firstName || "Partenaire",
    companyName: business?.companyName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "votre agence",
    publiees,
    brouillons,
    manquesCommuns,
    photosProvisoires,
    dashboardUrl: `${APP_URL}/vendor/dashboard`,
  });

  console.log(`\n── ${user.firstName} ${user.lastName} <${user.email}>`);
  console.log(`   agence .................. ${business?.companyName || "—"}`);
  console.log(`   publiées ................ ${publiees.length}`);
  console.log(`   en brouillon ............ ${brouillons.length}`);
  brouillons.forEach((b) => console.log(`      · ${b.titre} → ${b.manques.join(", ")}`));
  console.log(`   manques sur toute la flotte ${manquesCommuns.join(", ") || "aucun"}`);
  console.log(`   photos provisoires ...... ${photosProvisoires ? "OUI (signalé dans l'e-mail)" : "non"}`);
  console.log(`   objet ................... ${message.subject}`);

  if (!CONFIRME) {
    console.log(`\n──────── VERSION TEXTE ────────\n${message.text}\n───────────────────────────────`);
    console.log("\n══ Simulation terminée — rien n'a été envoyé.");
  } else {
    const r = await sendEmail({
      to: user.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      userId: String(user._id),
    });
    console.log(r?.success === false ? `\n   ❌ échec : ${r.error}` : "\n   ✅ e-mail envoyé");
  }

  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
