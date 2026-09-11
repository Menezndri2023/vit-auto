/**
 * Rattrapage sur les réservations antérieures aux garde-fous actuels.
 *
 *   node scripts/reparerReservationsAnciennes.mjs          → simulation
 *   node scripts/reparerReservationsAnciennes.mjs --apply  → correction
 *
 * DEUX CHOSES, et rien d'autre :
 *
 * 1. RÉFÉRENCE MANQUANTE. `Booking.reference` (VIT-LOC-2026-000001) est
 *    généré à la création depuis une certaine version. Trois réservations de
 *    juin 2026 n'en ont pas : elles apparaissent sous leur identifiant brut sur
 *    les contrats, les factures et dans le tableau de bord partenaire. La
 *    référence est reconstruite avec l'ANNÉE D'ORIGINE de la réservation, pas
 *    l'année courante — une référence 2026 sur une réservation de 2026.
 *
 * 2. PAIEMENTS SANS RÉSERVATION. Trois enregistrements de paiement ne
 *    référencent aucune réservation existante, dont un « cash » de 2 000 000 et
 *    deux « card » alors qu'aucune passerelle n'a jamais été branchée. Ils
 *    faussent tout décompte de recettes. Ils sont LISTÉS ici mais jamais
 *    supprimés automatiquement : un enregistrement financier ne se détruit pas
 *    sur la foi d'un script. Le retrait se demande explicitement, une fois la
 *    liste lue.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const APPLIQUER = process.argv.includes("--apply");
const PURGER_PAIEMENTS = process.argv.includes("--purger-paiements-orphelins");

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });

const Booking = (await import("../models/Booking.js")).default;
const Payment = (await import("../models/Payment.js")).default;

const PREFIXE = { location: "LOC", essai: "ESS", chauffeur: "CHF", leasing: "LEA", activite: "ACT" };

// ── 1. Références manquantes ───────────────────────────────────────────────
const sansRef = await Booking.find({ $or: [{ reference: null }, { reference: { $exists: false } }] })
  .select("type createdAt montantTotal status").sort({ createdAt: 1 }).lean();

console.log(`Réservations sans référence : ${sansRef.length}`);
const attribuees = [];
for (const b of sansRef) {
  const annee = new Date(b.createdAt).getFullYear();
  const prefixe = PREFIXE[b.type] || "SVC";
  // Numérotation cherchée jusqu'au premier libre : deux réservations du même
  // type et de la même année ne doivent pas recevoir la même référence, et
  // l'index unique refuserait la seconde.
  let n = await Booking.countDocuments({ reference: new RegExp(`^VIT-${prefixe}-${annee}-`) });
  let ref;
  do { n += 1; ref = `VIT-${prefixe}-${annee}-${String(n).padStart(6, "0")}`; }
  while (await Booking.exists({ reference: ref }) || attribuees.includes(ref));
  attribuees.push(ref);
  console.log(`  ${String(b._id).slice(-8)} | ${b.type} | ${b.status} | ${new Date(b.createdAt).toISOString().slice(0, 10)} → ${ref}`);
  if (APPLIQUER) await Booking.updateOne({ _id: b._id }, { $set: { reference: ref } });
}

// ── 2. Paiements orphelins ─────────────────────────────────────────────────
const paiements = await Payment.find().select("booking method status amount createdAt").lean();
const idsReservations = new Set((await Booking.find().select("_id").lean()).map((b) => String(b._id)));
const orphelins = paiements.filter((p) => !p.booking || !idsReservations.has(String(p.booking)));

console.log(`\nPaiements ne référençant aucune réservation : ${orphelins.length}`);
orphelins.forEach((p) => console.log(`  ${String(p._id).slice(-8)} | ${p.method} | ${p.status} | ${p.amount} | ${new Date(p.createdAt).toISOString().slice(0, 10)}`));

if (PURGER_PAIEMENTS && APPLIQUER && orphelins.length) {
  const r = await Payment.deleteMany({ _id: { $in: orphelins.map((p) => p._id) } });
  console.log(`  → ${r.deletedCount} paiement(s) orphelin(s) supprimé(s).`);
} else if (orphelins.length) {
  console.log("  → Conservés. Ajouter --purger-paiements-orphelins (avec --apply) pour les retirer.");
}

console.log(APPLIQUER ? "\nCorrections appliquées." : "\nSimulation — rien n'a été écrit.");
await mongoose.disconnect();
