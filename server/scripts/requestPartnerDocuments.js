import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Activity from "../models/Activity.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import { sendEmail } from "../services/communication/channels/EmailChannel.js";
import { partnerDocumentsRequestTemplate } from "../services/communication/templates/email/PartnerDocumentsRequest.js";
import { autorisationProvisoireActive } from "../utils/publishingGate.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// DEMANDE DES PIÈCES LÉGALES À UN PARTENAIRE PUBLIÉ PAR AVANCE
// ═══════════════════════════════════════════════════════════════════════════
// S'adresse à un partenaire dont les annonces sont EN LIGNE grâce à une
// autorisation provisoire (User.provisionalPublishingUntil). L'échéance du
// message est celle de l'autorisation elle-même, lue en base : une date écrite
// à la main dans un e-mail se désynchronise dès qu'un admin prolonge ou révoque.
//
// SIMULATION PAR DÉFAUT :
//   node scripts/requestPartnerDocuments.js <email> [--app-url=https://…] [--confirm]

const CONFIRME = process.argv.includes("--confirm");
const CIBLE = process.argv.slice(2).find((a) => a.includes("@") && !a.startsWith("--"));
const OVERRIDE = process.argv.find((a) => a.startsWith("--app-url="))?.slice("--app-url=".length);
const APP_URL = OVERRIDE || process.env.APP_URL || process.env.FRONTEND_URL || "https://vit-auto.com";

// Voir notifyRentalPartner.js : lancé depuis un poste de développement, APP_URL
// vaut localhost et le bouton part vers une adresse injoignable.
const URL_LOCALE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(APP_URL);

// Reprend mot pour mot les libellés du portail d'onboarding
// (src/pages/PartnerOnboardingPortal.jsx, DOC_FIELDS) : un partenaire qui reçoit
// une liste puis en découvre une autre à l'écran doute des deux.
const DOCUMENTS_ENTREPRISE = [
  { label: "Certificat d'immatriculation", hint: "RCCM, Kbis, Registre de commerce…" },
  { label: "Licence commerciale",          hint: "Business License, patente…" },
  { label: "Attestation fiscale",          hint: "si applicable" },
  { label: "Justificatif d'adresse",       hint: "facture ou relevé bancaire au nom de l'entreprise" },
];

async function main() {
  if (!CIBLE) {
    console.error("Usage : node scripts/requestPartnerDocuments.js <email> [--app-url=https://…] [--confirm]");
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

  const business = await PartnerBusiness.findOne({ owner: user._id }).select("companyName").lean();

  // Un partenaire peut publier des activités, des véhicules ou des chauffeurs :
  // le message doit compter ce qu'il a RÉELLEMENT en ligne, pas supposer.
  const [activites, vehicules, chauffeurs] = await Promise.all([
    Activity.countDocuments({ owner: user._id, status: "approved" }),
    Vehicle.countDocuments({ owner: user._id, status: "approved" }),
    Driver.countDocuments({ owner: user._id, status: "approved" }),
  ]);
  const enLigne = activites + vehicules + chauffeurs;

  const provisoire = autorisationProvisoireActive(user);
  console.log(`\n── ${user.firstName} ${user.lastName} <${user.email}>`);
  console.log(`   entité .................. ${business?.companyName || "—"}`);
  console.log(`   annonces en ligne ....... ${enLigne} (${activites} activités, ${vehicules} véhicules, ${chauffeurs} chauffeurs)`);
  console.log(`   certification ........... ${user.certificationBadge}`);
  console.log(`   autorisation provisoire   ${provisoire ? `active jusqu'au ${new Date(user.provisionalPublishingUntil).toISOString().slice(0, 10)}` : "aucune"}`);

  if (user.certificationBadge !== "none") {
    console.log("\n   ⚠️  Ce partenaire est DÉJÀ certifié — il n'a aucune pièce à fournir. Rien à envoyer.");
    await mongoose.disconnect();
    return;
  }

  const message = partnerDocumentsRequestTemplate({
    firstName: user.firstName || "Partenaire",
    companyName: business?.companyName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "votre entreprise",
    annoncesEnLigne: enLigne,
    documents: DOCUMENTS_ENTREPRISE,
    dateLimite: provisoire ? user.provisionalPublishingUntil : null,
    onboardingUrl: `${APP_URL}/partner-onboarding`,
  });

  console.log(`   objet ................... ${message.subject}`);

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
