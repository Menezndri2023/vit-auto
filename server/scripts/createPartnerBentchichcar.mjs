/**
 * Script ponctuel : création du compte partenaire BENTCHICHCAR (agence de
 * location, Rabat, Maroc). Usage : node server/scripts/createPartnerBentchichcar.mjs
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";

const EMAIL = "fahdbentchich67@gmail.com";
const PHONE = "+212661704104";
const PASSWORD = process.env.PARTNER_SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI non défini");

  await mongoose.connect(uri);
  console.log("Connecté à MongoDB\n");

  let user = await User.findOne({ $or: [{ email: EMAIL }, { phone: PHONE }] });
  if (user) {
    console.log(`Le compte existe déjà : ${user.email} (id=${user._id}) — aucun changement.`);
  } else {
    const hashed = await bcrypt.hash(PASSWORD, 12);
    user = await User.create({
      firstName: "Fahed",
      lastName: "Bentchich",
      email: EMAIL,
      phone: PHONE,
      password: hashed,
      role: "partenaire",
      partnerActivity: "loueur",
      partnerActivities: ["loueur"],
      entityType: "entreprise",
      country: "MA",
      address: "LOT HAJ SLIMANE N99 CYM RABAT",
      emailVerified: true,
      kycStatus: "VERIFIE",
      certificationBadge: "verifie",
      isActive: true,
      business: {
        companyName: "BENTCHICHCAR",
        address: "LOT HAJ SLIMANE N99 CYM RABAT",
      },
    });
    console.log(`Compte partenaire créé : ${user.email} (id=${user._id})`);
    console.log(`Mot de passe temporaire : ${PASSWORD}`);
  }

  let business = await PartnerBusiness.findOne({ owner: user._id });
  if (business) {
    console.log(`PartnerBusiness déjà existant (id=${business._id}) — aucun changement.`);
  } else {
    business = await PartnerBusiness.create({
      owner: user._id,
      companyName: "BENTCHICHCAR",
      country: "MA",
      ville: "RABAT",
      adresse: "LOT HAJ SLIMANE N99 CYM RABAT",
      contactNom: "Fahed Bentchich",
      contactTel: PHONE,
      isDefault: true,
      isConcessionnaire: false,
    });
    console.log(`PartnerBusiness créé (id=${business._id})`);
  }

  console.log(`\nuser_id=${user._id}`);
  console.log(`business_id=${business._id}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
