/**
 * Script : Migration des prix Vehicle/Booking/Driver (FCFA/XOF implicite → USD)
 * Usage  : cd server && node scripts/migrate-vehicle-booking-to-usd.mjs [--execute] [--rate=600]
 *
 * Par défaut en mode DRY-RUN (aucune écriture) : affiche un rapport détaillé
 * de ce qui serait modifié. Ajouter --execute pour appliquer réellement, après
 * avoir vérifié le rapport. Une sauvegarde JSON complète des documents
 * concernés est écrite AVANT toute écriture réelle (server/backups/) — jamais
 * après, pour rester restaurable même si l'exécution est interrompue en cours.
 *
 * Détection "à migrer" — accès direct à la collection Mongo brute (pas via un
 * modèle Mongoose), pour ne jamais laisser un `default` de schéma masquer un
 * champ réellement absent en base :
 *   - vehicles  : `currency` absent  (champ neuf, n'existait pas avant)
 *   - drivers   : `currency` absent  (champ neuf)
 *   - contracts : `currency` absent  (champ neuf — noms terms.*XOF conservés)
 *   - bookings  : `devise === "XOF"` (champ déjà existant, valeur explicite à remplacer)
 *
 * Conversion : division par le taux XOF (unités XOF pour 1 USD, depuis
 * ExchangeRate — voir server/models/ExchangeRate.js), arrondi à 2 décimales.
 * Un taux figé au moment de la migration (--rate) permet de rejouer le script
 * de façon reproductible même si le taux ExchangeRate est modifié entretemps.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

const EXECUTE = process.argv.includes("--execute");
const rateArg = process.argv.find((a) => a.startsWith("--rate="));

const round2 = (n) => Math.round(n * 100) / 100;
const toUSD = (xofValue, rate) => (xofValue == null ? xofValue : round2(xofValue / rate));

async function getXofRate() {
  if (rateArg) return Number(rateArg.split("=")[1]);
  const { default: ExchangeRate } = await import("../models/ExchangeRate.js");
  const xof = await ExchangeRate.findOne({ code: "XOF" }).lean();
  if (!xof) throw new Error("Aucun taux XOF trouvé dans ExchangeRate — lancer d'abord migrate-currency-config.mjs, ou fournir --rate=600.");
  return xof.rateFromUSD;
}

function previewVehicles(docs, rate) {
  console.log(`\n── Vehicle : ${docs.length} annonce(s) à migrer (aperçu des 5 premières) ──`);
  console.table(docs.slice(0, 5).map((v) => ({
    id: v._id.toString(), title: v.title,
    "pricePerDay avant→après":  `${v.pricePerDay} → ${toUSD(v.pricePerDay, rate)}`,
    "priceForSale avant→après": `${v.priceForSale} → ${toUSD(v.priceForSale, rate)}`,
    "caution avant→après":      `${v.caution} → ${toUSD(v.caution, rate)}`,
  })));
}

function previewBookings(docs, rate) {
  console.log(`\n── Booking : ${docs.length} réservation(s) à migrer (aperçu des 5 premières) ──`);
  console.table(docs.slice(0, 5).map((b) => ({
    id: b._id.toString(), reference: b.reference,
    "montantTotal avant→après":     `${b.montantTotal} → ${toUSD(b.montantTotal, rate)}`,
    "commissionAmount avant→après": `${b.commissionAmount} → ${toUSD(b.commissionAmount, rate)}`,
    "partnerPayout avant→après":    `${b.partnerPayout} → ${toUSD(b.partnerPayout, rate)}`,
  })));
}

function previewDrivers(docs, rate) {
  console.log(`\n── Driver : ${docs.length} profil(s) chauffeur à migrer (aperçu des 5 premiers) ──`);
  console.table(docs.slice(0, 5).map((d) => ({
    id: d._id.toString(), nom: `${d.firstName} ${d.lastName}`,
    "tarif avant→après":      `${d.tarif} → ${toUSD(d.tarif, rate)}`,
    "tarifHeure avant→après": `${d.tarifHeure} → ${toUSD(d.tarifHeure, rate)}`,
  })));
}

async function applyVehicles(col, docs, rate) {
  for (const v of docs) {
    await col.updateOne({ _id: v._id }, {
      $set: {
        currency:     "USD",
        pricePerDay:  toUSD(v.pricePerDay, rate),
        priceForSale: toUSD(v.priceForSale, rate),
        caution:      toUSD(v.caution, rate),
        ...(v.leasing ? {
          "leasing.apportInitial": toUSD(v.leasing.apportInitial, rate),
          "leasing.mensualite":    toUSD(v.leasing.mensualite, rate),
        } : {}),
        ...(v.credit ? {
          "credit.apportInitial": toUSD(v.credit.apportInitial, rate),
          "credit.mensualite":    toUSD(v.credit.mensualite, rate),
        } : {}),
      },
    });
  }
  console.log(`✅ ${docs.length} véhicule(s) migré(s) vers USD.`);
}

async function applyBookings(col, docs, rate) {
  for (const b of docs) {
    await col.updateOne({ _id: b._id }, {
      $set: {
        devise:           "USD",
        montantBase:      toUSD(b.montantBase, rate),
        montantOptions:   toUSD(b.montantOptions, rate),
        montantTotal:     toUSD(b.montantTotal, rate),
        commissionAmount: toUSD(b.commissionAmount, rate),
        serviceFeeFCFA:   toUSD(b.serviceFeeFCFA, rate),
        cautionAmount:    toUSD(b.cautionAmount, rate),
        partnerPayout:    toUSD(b.partnerPayout, rate),
        ...(b.leasing ? {
          "leasing.apportInitial": toUSD(b.leasing.apportInitial, rate),
          "leasing.mensualite":    toUSD(b.leasing.mensualite, rate),
          "leasing.totalLeasing":  toUSD(b.leasing.totalLeasing, rate),
        } : {}),
        ...(b.transaction?.financing ? {
          "transaction.financing.apportInitial": toUSD(b.transaction.financing.apportInitial, rate),
          "transaction.financing.mensualite":     toUSD(b.transaction.financing.mensualite, rate),
        } : {}),
        ...(b.transaction?.finalAmount != null ? {
          "transaction.finalAmount": toUSD(b.transaction.finalAmount, rate),
        } : {}),
      },
    });
  }
  console.log(`✅ ${docs.length} réservation(s) migrée(s) vers USD.`);
}

async function applyDrivers(col, docs, rate) {
  for (const d of docs) {
    await col.updateOne({ _id: d._id }, {
      $set: { currency: "USD", tarif: toUSD(d.tarif, rate), tarifHeure: toUSD(d.tarifHeure, rate) },
    });
  }
  console.log(`✅ ${docs.length} profil(s) chauffeur migré(s) vers USD.`);
}

function previewContracts(docs, rate) {
  console.log(`\n── Contract : ${docs.length} contrat(s) à migrer (aperçu des 5 premiers) ──`);
  console.table(docs.slice(0, 5).map((c) => ({
    id: c._id.toString(), contractNumber: c.contractNumber,
    "totalXOF avant→après": `${c.terms?.totalXOF} → ${toUSD(c.terms?.totalXOF, rate)}`,
  })));
}

async function applyContracts(col, docs, rate) {
  for (const c of docs) {
    const t = c.terms || {};
    await col.updateOne({ _id: c._id }, {
      $set: {
        currency: "USD",
        "terms.dailyRateXOF":     toUSD(t.dailyRateXOF, rate),
        "terms.cautionXOF":       toUSD(t.cautionXOF, rate),
        "terms.serviceFeeXOF":    toUSD(t.serviceFeeXOF, rate),
        "terms.optionsXOF":       toUSD(t.optionsXOF, rate),
        "terms.baseXOF":          toUSD(t.baseXOF, rate),
        "terms.totalXOF":         toUSD(t.totalXOF, rate),
        "terms.commissionXOF":    toUSD(t.commissionXOF, rate),
        "terms.partnerPayoutXOF": toUSD(t.partnerPayoutXOF, rate),
        "terms.apportInitial":    toUSD(t.apportInitial, rate),
        "terms.mensualite":       toUSD(t.mensualite, rate),
      },
    });
  }
  console.log(`✅ ${docs.length} contrat(s) migré(s) vers USD.`);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connecté à MongoDB.", EXECUTE ? "MODE EXÉCUTION RÉELLE" : "MODE DRY-RUN (aucune écriture)");

  const rate = await getXofRate();
  console.log(`Taux de conversion utilisé : 1 USD = ${rate} XOF`);

  const db = mongoose.connection.db;
  const vehiclesCol  = db.collection("vehicles");
  const bookingsCol  = db.collection("bookings");
  const driversCol   = db.collection("drivers");
  const contractsCol = db.collection("contracts");

  // ── Phase 1 : lecture seule — jamais d'écriture avant la sauvegarde ────────
  const vehicles  = await vehiclesCol.find({ currency: { $exists: false } }).toArray();
  const bookings  = await bookingsCol.find({ devise: "XOF" }).toArray();
  const drivers   = await driversCol.find({ currency: { $exists: false } }).toArray();
  const contracts = await contractsCol.find({ currency: { $exists: false } }).toArray();

  previewVehicles(vehicles, rate);
  previewBookings(bookings, rate);
  previewDrivers(drivers, rate);
  previewContracts(contracts, rate);

  if (!EXECUTE) {
    console.log("\n── DRY-RUN terminé, aucune écriture effectuée. Relancer avec --execute pour appliquer. ──");
    await mongoose.disconnect();
    return;
  }

  // ── Phase 2 : sauvegarde AVANT toute écriture ──────────────────────────────
  const backupDir = join(__dirname, "../backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `pre-usd-migration-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ vehicles, bookings, drivers, contracts }, null, 2));
  console.log(`\n💾 Sauvegarde des documents pré-migration écrite : ${backupPath}`);

  // ── Phase 3 : écriture réelle ───────────────────────────────────────────────
  await applyVehicles(vehiclesCol, vehicles, rate);
  await applyBookings(bookingsCol, bookings, rate);
  await applyDrivers(driversCol, drivers, rate);
  await applyContracts(contractsCol, contracts, rate);

  await mongoose.disconnect();
  console.log("\n✅ Migration terminée.");
}

run().catch((err) => {
  console.error("Erreur de migration:", err);
  process.exit(1);
});
