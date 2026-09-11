/**
 * Sort les photos de profil encodées en base64 de la base, vers ImageKit.
 *
 *   node scripts/migrerPhotosProfilVersImageKit.mjs          # simulation
 *   node scripts/migrerPhotosProfilVersImageKit.mjs --apply  # migration réelle
 *
 * POURQUOI. `User.profilePhoto` stocke l'image DANS le document utilisateur —
 * jusqu'à 1,9 Mo pour un seul compte. Toute requête qui lit des utilisateurs en
 * lot en paie le prix : la vitrine des partenaires répondait en 23 secondes
 * parce qu'elle chargeait ces photos pour 108 candidats afin d'en afficher six.
 * Les corriger un par un au fil des incidents ne tient pas ; la seule réponse
 * durable est de ne plus les stocker là.
 *
 * PÉRIMÈTRE — photos de PROFIL uniquement. Les pièces d'identité KYC
 * (`identity.frontImage/backImage/selfie`, 32 Mo à elles seules) ne sont
 * VOLONTAIREMENT pas migrées ici : ce sont des données personnelles sensibles,
 * aujourd'hui servies derrière une authentification. Les déposer sur un CDN
 * sans URL signée les rendrait accessibles à quiconque devine ou intercepte le
 * lien — une régression de confidentialité, pas une optimisation. Cette
 * migration-là demande d'abord de trancher le mode d'accès (URL signées à
 * durée limitée), ce qui est une décision, pas un script.
 *
 * Idempotent : une photo déjà sur une URL est ignorée. Une seule écriture par
 * compte, et jamais de suppression — en cas d'échec d'envoi, le compte est
 * laissé tel quel et signalé.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const APPLIQUER = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });

const User = (await import("../models/User.js")).default;
const { uploadImage, isImageKitConfigured, FOLDERS } = await import("../config/imagekit.js");

if (APPLIQUER && !isImageKitConfigured()) {
  console.error("ImageKit n'est pas configuré (IMAGEKIT_* absentes). Rien n'a été fait.");
  await mongoose.disconnect();
  process.exit(1);
}

// Inventaire SANS charger les images : `$strLenBytes` mesure côté serveur. Les
// charger pour les compter reproduirait exactement le problème qu'on corrige.
const inventaire = await User.aggregate([
  { $match: { profilePhoto: { $type: "string", $ne: "" } } },
  { $project: {
    firstName: 1, lastName: 1, email: 1,
    octets: { $strLenBytes: "$profilePhoto" },
    base64: { $eq: [{ $substrCP: ["$profilePhoto", 0, 5] }, "data:"] },
  } },
  { $sort: { octets: -1 } },
]);

const aMigrer = inventaire.filter((u) => u.base64);
const total = aMigrer.reduce((s, u) => s + u.octets, 0);

console.log(`${inventaire.length} compte(s) avec une photo de profil, dont ${aMigrer.length} en base64`);
console.log(`Volume à sortir de la base : ${Math.round(total / 1024)} Ko\n`);
aMigrer.forEach((u) => console.log(`  ${[u.firstName, u.lastName].filter(Boolean).join(" ").padEnd(26)} ${String(u.email || "").padEnd(38)} ${Math.round(u.octets / 1024)} Ko`));

if (!APPLIQUER) {
  console.log("\nSimulation. Relancer avec --apply pour migrer.");
} else {
  let ok = 0;
  const echecs = [];
  for (const u of aMigrer) {
    // Un compte à la fois : charger toutes les photos d'un coup rejouerait le
    // pic mémoire qu'on cherche justement à supprimer.
    const doc = await User.findById(u._id).select("profilePhoto").lean();
    if (!doc?.profilePhoto?.startsWith("data:")) continue;
    try {
      const res = await uploadImage(doc.profilePhoto, { folder: FOLDERS.avatars });
      const url = res?.url;
      if (!url) throw new Error("réponse ImageKit sans URL");
      await User.updateOne({ _id: u._id }, { $set: { profilePhoto: url } });
      ok += 1;
      console.log(`  ✓ ${[u.firstName, u.lastName].filter(Boolean).join(" ")} → ${url.slice(0, 70)}`);
    } catch (e) {
      // Jamais d'écrasement en cas d'échec : la photo reste en base, lisible.
      echecs.push({ u, message: e.message });
      console.log(`  ✗ ${[u.firstName, u.lastName].filter(Boolean).join(" ")} — ${e.message}`);
    }
  }
  console.log(`\n${ok} photo(s) migrée(s), ${echecs.length} échec(s). Aucune photo perdue.`);
}

await mongoose.disconnect();
