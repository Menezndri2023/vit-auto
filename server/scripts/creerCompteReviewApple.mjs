/**
 * Compte de démonstration pour la review App Store (règle 2.1 : une app avec
 * connexion doit fournir un compte de test au reviewer).
 *
 *   node scripts/creerCompteReviewApple.mjs                 # simulation
 *   node scripts/creerCompteReviewApple.mjs --apply         # crée (ou réinitialise le mot de passe)
 *   node scripts/creerCompteReviewApple.mjs --apply --supprimer
 *   node scripts/creerCompteReviewApple.mjs --apply --partenaire   # 2e compte : PARTENAIRE
 *
 * Apple demande des identifiants POUR CHAQUE TYPE DE COMPTE (règle 2.1,
 * demande d'information du 2026-09-16). Le compte partenaire est une
 * entreprise loueur/vendeur/chauffeur, fondateur, identité vérifiée, autorisée
 * à publier sans certification (provisionalPublishing) ; marqué compte de test
 * pour que ses annonces de démonstration restent hors des vitrines publiques.
 *
 * Compte CLIENT, e-mail et téléphone marqués vérifiés, identité VERIFIE :
 * le reviewer ne peut ni recevoir un code e-mail ni passer un KYC — il doit
 * entrer directement dans un compte prêt à réserver. Il n'est PAS marqué
 * compte de test : il doit voir le catalogue public complet.
 * Le mot de passe est écrit dans ~/Desktop/COMPTE-REVIEW-APPLE.txt, jamais
 * affiché ici ni committé.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

const APPLIQUER = process.argv.includes("--apply");
const SUPPRIMER = process.argv.includes("--supprimer");
const PARTENAIRE = process.argv.includes("--partenaire");
const EMAIL = PARTENAIRE ? "review-partner@vit-auto.com" : "review-apple@vit-auto.com";

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
const User = (await import("../models/User.js")).default;
const PartnerBusiness = (await import("../models/PartnerBusiness.js")).default;

const existant = await User.findOne({ email: EMAIL });
console.log(existant ? `Compte existant : ${existant._id} (role ${existant.role}, kyc ${existant.kycStatus})` : "Aucun compte review-apple.");

if (!APPLIQUER) { console.log("Simulation — rien n'est écrit. Relancer avec --apply."); await mongoose.disconnect(); process.exit(0); }

if (SUPPRIMER) {
  if (existant) {
    await PartnerBusiness.deleteMany({ owner: existant._id });
    await User.deleteOne({ _id: existant._id }); console.log("Compte supprimé.");
  }
  await mongoose.disconnect(); process.exit(0);
}

const motDePasse = "Vit-" + crypto.randomBytes(9).toString("base64url") + "-2026";
const hash = await bcrypt.hash(motDePasse, 12);
const champs = PARTENAIRE ? {
  firstName: "Review", lastName: "Partner", email: EMAIL, password: hash,
  role: "partenaire", entityType: "entreprise", sellerType: "entreprise",
  partnerActivity: "loueur", partnerActivities: ["loueur", "vendeur", "chauffeur"],
  country: "CI", phone: null, birthDate: new Date("1985-01-01"),
  emailVerified: true, phoneVerified: true, isActive: true,
  // Compte de test : ses annonces de démonstration n'atteignent aucune vitrine publique.
  isTestAccount: true, isFounder: true,
  kycStatus: "VERIFIE", kycScore: 96, kycBadge: "CERTIFIÉ", kycFaceMatchScore: 0.93, kycSubmittedAt: new Date(),
  identity: { type: "passport", status: "verified", submittedAt: new Date(), verifiedAt: new Date() },
  provisionalPublishing: { granted: true, until: null, grantedAt: new Date(), reason: "Compte de démonstration App Store (review Apple)" },
} : {
  firstName: "Review", lastName: "Apple", email: EMAIL, password: hash,
  role: "client", country: "CI", phone: null,
  emailVerified: true, phoneVerified: true, isActive: true, isTestAccount: false,
  kycStatus: "VERIFIE", birthDate: new Date("1990-01-01"),
  // Score et badge cohérents avec un KYC passé : sans eux, la page de
  // réservation affiche « INSUFFISANT — 0/100 » à un compte pourtant vérifié.
  kycScore: 96, kycBadge: "CERTIFIÉ", kycFaceMatchScore: 0.93,
  kycSubmittedAt: new Date(), identity: { type: "passport", status: "verified", submittedAt: new Date(), verifiedAt: new Date() },
};
let user;
if (existant) {
  Object.assign(existant, champs);
  user = await existant.save();
  console.log("Compte réinitialisé.");
} else {
  user = await User.create(champs);
  console.log(`Compte créé : ${user._id}`);
}
if (PARTENAIRE && !(await PartnerBusiness.findOne({ owner: user._id }))) {
  await PartnerBusiness.create({ owner: user._id, companyName: "Review Auto Demo", country: "CI", ville: "Abidjan", isDefault: true });
  console.log("Entité partenaire créée.");
}
const fichier = path.join(os.homedir(), "Desktop", PARTENAIRE ? "COMPTE-REVIEW-PARTENAIRE.txt" : "COMPTE-REVIEW-APPLE.txt");
fs.writeFileSync(fichier, `Compte de démonstration App Store (App Review Information) — ${PARTENAIRE ? "PARTENAIRE" : "CLIENT"}\n\nUser name : ${EMAIL}\nPassword  : ${motDePasse}\n\nCréé le ${new Date().toISOString().slice(0, 10)} par scripts/creerCompteReviewApple.mjs${PARTENAIRE ? " --partenaire" : ""}\n`, { mode: 0o600 });
console.log(`Identifiants écrits dans ${fichier}`);
await mongoose.disconnect();
