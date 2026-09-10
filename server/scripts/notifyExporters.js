import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import ImportExportListing from "../models/ImportExportListing.js";
import ImportCostConfig from "../models/ImportCostConfig.js";
import { sendEmail } from "../services/communication/channels/EmailChannel.js";
import { exporterProfileReminderTemplate } from "../services/communication/templates/email/ExporterProfileReminder.js";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// RELANCE DES PARTENAIRES EXPORTATEURS
// ═══════════════════════════════════════════════════════════════════════════
// Leurs annonces viennent d'être publiées, mais elles sont incomplètes : aucune
// ne porte d'Incoterm, et certaines visent des pays dont le barème douanier
// n'est pas encore renseigné.
//
// Le message ne demande pas de « compléter son profil » — personne ne se lève
// pour remplir un formulaire. Il chiffre ce que chaque manque coûte à
// l'exportateur, sur SES annonces à lui : sans Incoterm, le coût rendu affiché
// à l'acheteur est majoré par prudence, et son annonce paraît plus chère
// qu'elle ne l'est.
//
// SIMULATION PAR DÉFAUT. Un e-mail part vers une personne réelle et ne se
// rattrape pas : rien n'est envoyé sans `--confirm`.
//
//   node scripts/notifyExporters.js            → simulation (affiche le message)
//   node scripts/notifyExporters.js --confirm  → envoi réel

const CONFIRME = process.argv.includes("--confirm");
const OVERRIDE = process.argv.find((a) => a.startsWith("--app-url="))?.slice("--app-url=".length);
const APP_URL = OVERRIDE || process.env.APP_URL || process.env.FRONTEND_URL || "https://vit-auto.com";

// Voir la note identique dans notifyRentalPartner.js : lancé depuis un poste de
// développement, APP_URL vaut localhost et le bouton de l'e-mail part vers une
// adresse injoignable pour le destinataire. Un e-mail ne se rattrape pas.
const URL_LOCALE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(APP_URL);

async function main() {
  if (CONFIRME && URL_LOCALE) {
    console.error(
      `\n⛔ APP_URL vaut « ${APP_URL} » : le bouton de l'e-mail pointerait vers une adresse locale,`
      + `\n   injoignable pour le destinataire. Relancez avec --app-url=https://vit-auto.com\n`
    );
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(CONFIRME ? "\n⚡ ENVOI RÉEL" : "\n🔍 SIMULATION — aucun e-mail envoyé (ajouter --confirm)");

  // Un exportateur = un partenaire ayant au moins une annonce publiée.
  const parPartenaire = await ImportExportListing.aggregate([
    { $match: { status: "approved" } },
    {
      $group: {
        _id: "$partner",
        total: { $sum: 1 },
        sansIncoterm: { $sum: { $cond: [{ $in: ["$incoterm", [null, ""]] }, 1, 0] } },
        destinations: { $addToSet: "$availableIn" },
        devises: { $addToSet: "$currency" },
      },
    },
  ]);

  const baremes = await ImportCostConfig.find({ active: true }).select("country").lean();
  const paysCouverts = new Set(baremes.map((b) => b.country.toLowerCase()));

  let envoyes = 0;

  for (const p of parPartenaire) {
    const user = await User.findById(p._id).select("firstName lastName email").lean();
    if (!user?.email) {
      console.log(`   ⚠️  partenaire ${p._id} sans e-mail — ignoré`);
      continue;
    }

    // Aplatit les tableaux de destinations et ne garde que les pays dont le
    // barème manque : citer un pays déjà couvert ferait douter du message.
    const destinations = [...new Set(p.destinations.flat().filter(Boolean))];
    const paysSansBareme = destinations.filter((d) => !paysCouverts.has(String(d).toLowerCase()));

    const message = exporterProfileReminderTemplate({
      firstName: user.firstName || "Partenaire",
      companyName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "votre société",
      totalListings: p.total,
      sansIncoterm: p.sansIncoterm,
      paysSansBareme,
      dashboardUrl: `${APP_URL}/importer-dashboard`,
      currency: p.devises.includes("USD") ? "USD" : (p.devises[0] || "USD"),
    });

    console.log(`\n── ${user.firstName} ${user.lastName} <${user.email}>`);
    console.log(`   annonces publiées ....... ${p.total}`);
    console.log(`   sans Incoterm ........... ${p.sansIncoterm}`);
    console.log(`   destinations sans barème  ${paysSansBareme.length ? paysSansBareme.join(", ") : "aucune"}`);
    console.log(`   objet ................... ${message.subject}`);

    if (CONFIRME) {
      const r = await sendEmail({
        to: user.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        userId: String(user._id),
      });
      console.log(r?.success === false ? `   ❌ échec : ${r.error}` : "   ✅ envoyé");
      if (r?.success !== false) envoyes += 1;
    }
  }

  console.log(`\n══ ${parPartenaire.length} exportateur(s) concerné(s)${CONFIRME ? `, ${envoyes} e-mail(s) envoyé(s)` : " — simulation, rien n'a été envoyé"}.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
