/**
 * Archive les annonces dont le propriétaire n'existe plus.
 *
 *   node scripts/archiverAnnoncesOrphelines.mjs          # simulation
 *   node scripts/archiverAnnoncesOrphelines.mjs --apply  # archive
 *
 * Une annonce sans propriétaire ne peut pas être honorée : personne ne répond,
 * personne n'encaisse, personne ne remet les clés. Tant qu'elle reste
 * `approved` + `available`, un client peut pourtant la réserver.
 *
 * Ces annonces PRÉCÈDENT la cascade de suppression de compte
 * (usersController.deleteUser), qui supprime aujourd'hui les annonces sans
 * réservation et archive les autres. Il s'agit donc d'un rattrapage
 * d'historique, pas d'un défaut courant.
 *
 * ARCHIVER et non supprimer : une annonce peut figurer dans une réservation
 * passée ou une facture, et sa suppression laisserait des références pendantes.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const APPLIQUER = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });

const User    = (await import("../models/User.js")).default;
const Vehicle = (await import("../models/Vehicle.js")).default;
const Driver  = (await import("../models/Driver.js")).default;
const Activity = (await import("../models/Activity.js")).default;
const Subscription = (await import("../models/Subscription.js")).default;

const idsUtilisateurs = new Set((await User.find().select("_id").lean()).map((u) => String(u._id)));
const orphelin = (doc, champ = "owner") => !doc[champ] || !idsUtilisateurs.has(String(doc[champ]));

const vehicules = (await Vehicle.find().select("title status available owner ville").lean()).filter((v) => orphelin(v));
const chauffeurs = (await Driver.find().select("firstName lastName status owner").lean()).filter((d) => orphelin(d));
const activites  = (await Activity.find().select("title status owner").lean()).filter((a) => orphelin(a));
const abonnements = (await Subscription.find().select("vendor plan").lean()).filter((s) => orphelin(s, "vendor"));

const enLigne = vehicules.filter((v) => v.status === "approved" && v.available);

console.log(`Annonces orphelines : ${vehicules.length} (dont ${enLigne.length} EN LIGNE)`);
vehicules.forEach((v) => console.log(`  ${v.status.padEnd(9)} dispo=${String(v.available).padEnd(5)} ${(v.title || "?").slice(0, 46).padEnd(48)} ${v.ville || "-"}`));
console.log(`Chauffeurs orphelins : ${chauffeurs.length}`);
console.log(`Activités orphelines : ${activites.length}`);
console.log(`Abonnements sans vendeur : ${abonnements.length}`);

if (!APPLIQUER) {
  console.log("\nSimulation. Relancer avec --apply pour archiver et nettoyer.");
} else {
  const idsV = vehicules.filter((v) => v.status !== "archived" || v.available).map((v) => v._id);
  const idsD = chauffeurs.filter((d) => d.status !== "archived").map((d) => d._id);
  const idsA = activites.filter((a) => a.status !== "archived").map((a) => a._id);

  const [rv, rd, ra, rs] = await Promise.all([
    idsV.length ? Vehicle.updateMany({ _id: { $in: idsV } }, { $set: { status: "archived", available: false, featured: false } }) : { modifiedCount: 0 },
    idsD.length ? Driver.updateMany({ _id: { $in: idsD } }, { $set: { status: "archived" } }) : { modifiedCount: 0 },
    idsA.length ? Activity.updateMany({ _id: { $in: idsA } }, { $set: { status: "archived", available: false } }) : { modifiedCount: 0 },
    // Un abonnement sans vendeur ne désigne plus rien : rien à conserver, et il
    // fausserait un décompte d'abonnés.
    abonnements.length ? Subscription.deleteMany({ _id: { $in: abonnements.map((s) => s._id) } }) : { deletedCount: 0 },
  ]);
  console.log(`\n${rv.modifiedCount} annonce(s), ${rd.modifiedCount} chauffeur(s), ${ra.modifiedCount} activité(s) archivés ; ${rs.deletedCount} abonnement(s) orphelin(s) supprimé(s).`);
}

await mongoose.disconnect();
