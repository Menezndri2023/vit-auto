/**
 * Joindre un document au dossier d'un partenaire, valider des critères, et
 * passer le dossier à un statut — par le MÊME code que l'onglet
 * « Vérification Partenaires » de l'admin (ajouterDocumentPartenaire,
 * adminToggleCriterion, adminUpdateStatus) : audit, notifications et
 * recalcul du score compris.
 *
 *   cd server && node scripts/verifierDossierPartenaire.mjs \
 *     --email=partenaire@exemple.com \
 *     --document=rccmDoc:"/chemin/vers/RC.pdf" \
 *     --criteres=businessLicense,addressVerified,repIdentified,verificationDone \
 *     --statut=verifie \
 *     --note="RC 139099 Rabat, siège et gérant conformes" \
 *     [--appliquer]
 *
 * Sans --appliquer : AUCUNE écriture, le script affiche ce qu'il ferait.
 * L'action est attribuée au premier administrateur actif (journal d'audit).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.length ? v.join("=") : true];
}));
const appliquer = !!args.appliquer;
if (!args.email) { console.error("--email requis"); process.exit(1); }

await mongoose.connect(process.env.MONGO_URI);
const { default: User } = await import("../models/User.js");
const { default: PartnerVerification } = await import("../models/PartnerVerification.js");
const pv = await import("../controllers/partnerVerificationController.js");
const { invokeController } = await import("../utils/invokeController.js");

const partenaire = await User.findOne({ email: String(args.email).toLowerCase() }).select("_id firstName lastName role").lean();
if (!partenaire || partenaire.role !== "partenaire") { console.error("Partenaire introuvable :", args.email); process.exit(1); }
const adminDoc = await User.findOne({ role: "admin", isActive: { $ne: false } }).sort({ createdAt: 1 }).lean();
// Les contrôleurs lisent req.user.id (virtuel absent d'un document brut).
const admin = adminDoc && { ...adminDoc, id: adminDoc._id.toString() };
if (!admin) { console.error("Aucun administrateur actif."); process.exit(1); }
const userId = partenaire._id.toString();
console.log(`Partenaire : ${partenaire.firstName} ${partenaire.lastName} (${userId}) — action attribuée à ${admin.email}`);
console.log(appliquer ? "MODE ÉCRITURE\n" : "Simulation (ajoutez --appliquer pour écrire)\n");

// 1. Document
if (args.document) {
  const [champ, ...p] = String(args.document).split(":");
  const fichier = p.join(":");
  const buf = fs.readFileSync(fichier);
  const mime = /\.pdf$/i.test(fichier) ? "application/pdf" : /\.png$/i.test(fichier) ? "image/png" : "image/jpeg";
  console.log(`• Document ${champ} ← ${path.basename(fichier)} (${(buf.length / 1024).toFixed(0)} Ko, ${mime})`);
  if (appliquer) {
    const r = await pv.ajouterDocumentPartenaire({ userId, champ, fichier: `data:${mime};base64,${buf.toString("base64")}`, admin });
    if (r.status !== 200) { console.error("  échec :", r.body.message); process.exit(1); }
    console.log("  déposé :", r.body.url.split("?")[0]);
  }
}

// 2. Critères
for (const critere of String(args.criteres || "").split(",").filter(Boolean)) {
  console.log(`• Critère validé : ${critere}`);
  if (appliquer) {
    const r = await invokeController(pv.adminToggleCriterion, { params: { userId }, body: { criterion: critere, verified: true, note: args.note || "" }, user: admin });
    if (r.statusCode >= 400) { console.error("  échec :", r.body?.message); process.exit(1); }
  }
}

// 3. Statut
if (args.statut) {
  console.log(`• Statut du dossier → ${args.statut}`);
  if (appliquer) {
    const r = await invokeController(pv.adminUpdateStatus, { params: { userId }, body: { status: args.statut, ...(args.note ? { adminNote: args.note } : {}) }, user: admin });
    if (r.statusCode >= 400) { console.error("  échec :", r.body?.message); process.exit(1); }
  }
}

const fin = await PartnerVerification.findOne({ userId }).lean();
if (fin) console.log(`\nDossier : statut ${fin.status}, score ${fin.trustScore}/100, niveau ${fin.trustLevel}, documents : ${Object.entries(fin.documents || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "aucun"}`);
else console.log("\nAucun dossier de vérification pour l'instant.");
await mongoose.disconnect();
