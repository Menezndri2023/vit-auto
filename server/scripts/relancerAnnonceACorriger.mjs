/**
 * Relance un partenaire dont une annonce a été dépubliée pour correction.
 *
 *   node scripts/relancerAnnonceACorriger.mjs <email>            → simulation
 *   node scripts/relancerAnnonceACorriger.mjs <email> --confirm  → envoi réel
 *
 * Distinct de notifyRentalPartner.js, qui ANNONCE une mise en ligne. Celui-ci
 * demande une correction, et ne se déclenche que s'il y a réellement quelque
 * chose à corriger : un e-mail qui reproche un manque déjà comblé décrédibilise
 * tout ce qu'on écrira ensuite.
 *
 * Le contenu est CALCULÉ depuis la base — le motif de dépublication, les champs
 * manquants, et la comparaison de tarif avec les autres locations du même pays.
 * Rien n'est rédigé à la main, donc rien ne vieillit.
 *
 * SIMULATION PAR DÉFAUT : un e-mail part vers une personne réelle et ne se
 * rattrape pas.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const CONFIRME = process.argv.includes("--confirm");
const CIBLE = process.argv.slice(2).find((a) => a.includes("@") && !a.startsWith("--"));
const APP_URL = process.argv.find((a) => a.startsWith("--app-url="))?.slice(10)
  || (process.env.APP_URL?.startsWith("http") && !process.env.APP_URL.includes("localhost") ? process.env.APP_URL : "https://vit-auto.com");

if (!CIBLE) { console.error("Usage : node scripts/relancerAnnonceACorriger.mjs <email> [--confirm]"); process.exit(1); }

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });

const User = (await import("../models/User.js")).default;
const Vehicle = (await import("../models/Vehicle.js")).default;
const { sendEmail } = await import("../services/communication/channels/EmailChannel.js");
const { baseEmail } = await import("../services/communication/templates/shared/base.js");
const { greeting, signature, btn, infoBox, escapeHtml } = await import("../services/communication/templates/shared/components.js");

const user = await User.findOne({ email: String(CIBLE).toLowerCase().trim() })
  .select("firstName lastName email country").lean();
if (!user) { console.error("Aucun compte pour cette adresse."); await mongoose.disconnect(); process.exit(1); }

// Ce qui manque, champ par champ — la même grille que l'audit de publication.
const manques = (v) => {
  const m = [];
  if (!(v.caution > 0)) m.push("la caution demandée au client");
  if (!(v.dureeMinLocation > 0)) m.push("la durée minimale de location");
  if (!v.description || v.description.trim().length < 80) m.push("une description d'au moins quelques lignes");
  if ((v.images || []).length < 3) m.push("au moins trois photos");
  if (!v.carburant) m.push("le carburant");
  if (!v.transmission) m.push("la transmission");
  return m;
};

const aCorriger = await Vehicle.find({ owner: user._id, status: { $in: ["pending", "rejected"] } })
  .select("title type status rejectionReason pricePerDay priceForSale caution dureeMinLocation description images carburant transmission country currency")
  .lean();

if (!aCorriger.length) {
  console.log(`Rien à corriger pour ${user.email} — aucun e-mail n'a lieu d'être.`);
  await mongoose.disconnect();
  process.exit(0);
}

// Repère de marché, calculé et non affirmé : la médiane des locations publiées
// du même pays. Sans elle, dire « votre tarif est élevé » n'engage à rien.
const repere = {};
for (const v of aCorriger.filter((x) => x.type === "location")) {
  if (repere[v.country]) continue;
  const prix = (await Vehicle.find({ country: v.country, status: "approved", type: "location", pricePerDay: { $gt: 0 } })
    .select("pricePerDay").lean()).map((x) => x.pricePerDay).sort((a, b) => a - b);
  if (prix.length) repere[v.country] = { median: prix[Math.floor(prix.length / 2)], min: prix[0], max: prix[prix.length - 1], n: prix.length };
}

const lignes = aCorriger.map((v) => {
  const m = manques(v);
  const r = repere[v.country];
  const tarifSuspect = v.type === "location" && r && v.pricePerDay > r.median * 10;
  return { v, m, r, tarifSuspect };
});

const objet = `${user.firstName || "Partenaire"} — une annonce à corriger avant remise en ligne`;

const corpsHtml = `
  ${greeting(user.firstName)}
  <p style="font-size:14px;color:#1e293b;line-height:1.7;margin:0 0 16px">
    ${lignes.length === 1 ? "Une de vos annonces a été" : `${lignes.length} de vos annonces ont été`}
    momentanément retirée${lignes.length > 1 ? "s" : ""} de la publication, le temps d'une correction.
    Rien n'est perdu : ${lignes.length > 1 ? "elles repartent" : "elle repart"} en ligne dès que c'est fait.
  </p>
  ${lignes.map(({ v, m, r, tarifSuspect }) => `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:0 0 14px">
      <strong style="color:#0f1b3f;font-size:15px">${escapeHtml(v.title || "Annonce")}</strong>
      ${tarifSuspect ? infoBox(
        `<strong>Tarif journalier à vérifier.</strong> Votre annonce indique
         ${Math.round(v.pricePerDay)} USD par jour. Sur ${escapeHtml(v.country || "ce pays")},
         les ${r.n} locations publiées se situent entre ${Math.round(r.min)} et ${Math.round(r.max)} USD par jour
         (médiane ${Math.round(r.median)} USD). Vérifiez qu'il s'agit bien d'un tarif JOURNALIER,
         et non d'un prix mensuel, d'un prix de vente, ou d'un montant saisi dans une autre devise.`,
        "warning") : ""}
      ${m.length ? `<p style="font-size:13.5px;color:#475569;line-height:1.7;margin:12px 0 0">
        À compléter également : ${m.join(", ")}.
      </p>` : ""}
    </div>`).join("")}
  <p style="font-size:14px;color:#1e293b;line-height:1.7;margin:16px 0">
    Tout se corrige depuis votre tableau de bord, en quelques minutes.
  </p>
  ${btn("Corriger mon annonce", `${APP_URL}/vendor/dashboard`)}
  <p style="font-size:13px;color:#64748b;line-height:1.7;margin:18px 0 0">
    Pour rappel, les locations se règlent en espèces, directement auprès de vous,
    au moment de la remise du véhicule.
  </p>
  ${signature()}
`;

const texte = [
  `Bonjour ${user.firstName || ""},`.trim(), "",
  `${lignes.length === 1 ? "Une de vos annonces a été retirée" : `${lignes.length} de vos annonces ont été retirées`} de la publication, le temps d'une correction. Elle${lignes.length > 1 ? "s repartent" : " repart"} en ligne dès que c'est fait.`, "",
  ...lignes.flatMap(({ v, m, r, tarifSuspect }) => [
    `- ${v.title || "Annonce"}`,
    ...(tarifSuspect ? [`  Tarif à vérifier : ${Math.round(v.pricePerDay)} USD/jour, alors que les ${r.n} locations publiées sur ${v.country} se situent entre ${Math.round(r.min)} et ${Math.round(r.max)} USD/jour (médiane ${Math.round(r.median)}). Vérifiez qu'il s'agit d'un tarif journalier et non mensuel, d'un prix de vente, ou d'une autre devise.`] : []),
    ...(m.length ? [`  À compléter : ${m.join(", ")}.`] : []),
  ]),
  "", `Corriger mon annonce : ${APP_URL}/vendor/dashboard`, "",
  "Pour rappel, les locations se règlent en espèces, directement auprès de vous, au moment de la remise du véhicule.",
  "", "L'équipe VIT AUTO",
].join("\n");

console.log(`   destinataire ........... ${user.email}`);
console.log(`   annonces à corriger .... ${lignes.length}`);
lignes.forEach(({ v, m, tarifSuspect }) => console.log(`     • ${(v.title || "?").slice(0, 44)} — ${tarifSuspect ? "TARIF SUSPECT" : "tarif ok"}${m.length ? ` — manque : ${m.join(", ")}` : ""}`));
console.log(`   objet .................. ${objet}\n`);
console.log("──────── VERSION TEXTE ────────");
console.log(texte);
console.log("───────────────────────────────\n");

if (!CONFIRME) {
  console.log("══ Simulation terminée — rien n'a été envoyé. Relancer avec --confirm.");
} else {
  const r = await sendEmail({
    to: user.email, subject: objet,
    html: baseEmail({ title: objet, preheader: "Une correction à apporter avant remise en ligne", body: corpsHtml }),
    text: texte, userId: String(user._id),
  });
  console.log(r?.success === false ? `══ ÉCHEC : ${r?.error || "inconnu"}` : "══ E-mail envoyé.");
}

await mongoose.disconnect();
