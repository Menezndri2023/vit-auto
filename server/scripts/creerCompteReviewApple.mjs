/**
 * Compte de démonstration pour la review App Store (règle 2.1 : une app avec
 * connexion doit fournir un compte de test au reviewer).
 *
 *   node scripts/creerCompteReviewApple.mjs                 # simulation
 *   node scripts/creerCompteReviewApple.mjs --apply         # crée (ou réinitialise le mot de passe)
 *   node scripts/creerCompteReviewApple.mjs --apply --supprimer
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
const EMAIL = "review-apple@vit-auto.com";

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
const User = (await import("../models/User.js")).default;

const existant = await User.findOne({ email: EMAIL });
console.log(existant ? `Compte existant : ${existant._id} (role ${existant.role}, kyc ${existant.kycStatus})` : "Aucun compte review-apple.");

if (!APPLIQUER) { console.log("Simulation — rien n'est écrit. Relancer avec --apply."); await mongoose.disconnect(); process.exit(0); }

if (SUPPRIMER) {
  if (existant) { await User.deleteOne({ _id: existant._id }); console.log("Compte supprimé."); }
  await mongoose.disconnect(); process.exit(0);
}

const motDePasse = "Vit-" + crypto.randomBytes(9).toString("base64url") + "-2026";
const hash = await bcrypt.hash(motDePasse, 12);
const champs = {
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
const fichier = path.join(os.homedir(), "Desktop", "COMPTE-REVIEW-APPLE.txt");
fs.writeFileSync(fichier, `Compte de démonstration App Store (App Review Information)\n\nUser name : ${EMAIL}\nPassword  : ${motDePasse}\n\nCréé le ${new Date().toISOString().slice(0, 10)} par scripts/creerCompteReviewApple.mjs\n`, { mode: 0o600 });
console.log(`Identifiants écrits dans ${fichier}`);
await mongoose.disconnect();
