/**
 * Script : purger l'historique de réservations d'un partenaire
 * Usage  :
 *    node server/scripts/purgePartnerBookings.js <email-ou-entreprise>            → SIMULATION
 *    node server/scripts/purgePartnerBookings.js <email-ou-entreprise> --confirm  → suppression réelle
 *
 * Cas d'usage : des réservations de TEST ont été créées sur les annonces d'un
 * partenaire avant de lui remettre ses identifiants. Il ne doit pas les trouver
 * en se connectant.
 *
 * ⚠️  SUPPRESSION DÉFINITIVE ET IRRÉVERSIBLE.
 * Par défaut le script ne supprime RIEN : il affiche l'inventaire exact de ce
 * qui serait supprimé. Relancez avec --confirm pour appliquer.
 *
 * Une réservation n'est jamais seule : huit collections y font référence
 * (paiement, reçu/contrat, facture, facture de prestation, avis, points de
 * fidélité, conversation, journal d'entretien) plus le registre des
 * commissions. Supprimer les seules réservations laisserait au partenaire des
 * factures et des reversements orphelins dans son espace — le script traite
 * donc l'ensemble.
 *
 * Le compte du partenaire, ses annonces et ses véhicules ne sont JAMAIS touchés.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

const col = (name) => mongoose.connection.db.collection(name);

// Logique extraite de la ligne de commande pour être testable sur une base
// jetable : un script qui supprime des données de production ne doit pas être
// le seul code du projet à n'être jamais exécuté par la suite de tests.
// Retourne un rapport { partner, bookings, plan, deleted } ; ne se connecte
// pas et ne quitte jamais le processus lui-même.
export async function purgePartnerBookings({ target: TARGET, confirm: CONFIRM = false, log = console.log } = {}) {
  // ── 1. Retrouver le partenaire ────────────────────────────────────────────
  const rx = new RegExp(`^${TARGET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  let partner = await col("users").findOne({ role: "partenaire", email: rx });
  if (!partner) {
    const biz = await col("partnerbusinesses").findOne({ companyName: rx });
    if (biz) partner = await col("users").findOne({ _id: biz.owner });
  }
  if (!partner) {
    log(`\n❌  Aucun partenaire trouvé pour « ${TARGET} » (email ou nom d'entreprise).\n`);
    return { partner: null, bookings: [], plan: [], deleted: 0 };
  }

  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`  Partenaire : ${partner.firstName || ""} ${partner.lastName || ""}`.trimEnd());
  log(`  Email      : ${partner.email}`);
  log(`  Mode       : ${CONFIRM ? "⚠️  SUPPRESSION RÉELLE" : "🔍 SIMULATION (rien ne sera supprimé)"}`);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── 2. Toutes ses annonces (véhicules, chauffeurs, activités) ─────────────
  const ids = async (name) => (await col(name).find({ owner: partner._id }).project({ _id: 1 }).toArray()).map((d) => d._id);
  const [vehicleIds, driverIds, activityIds] = await Promise.all([ids("vehicles"), ids("drivers"), ids("activities")]);

  // ── 3. Les réservations portant sur ces annonces ─────────────────────────
  const bookings = await col("bookings").find({
    $or: [
      { vehicle:  { $in: vehicleIds } },
      { driver:   { $in: driverIds } },
      { activity: { $in: activityIds } },
    ],
  }).project({ _id: 1, reference: 1, type: 1, status: 1, createdAt: 1, montantTotal: 1, clientInfo: 1 }).toArray();

  if (!bookings.length) {
    log("✅  Aucune réservation sur les annonces de ce partenaire — rien à supprimer.\n");
    return { partner, bookings: [], plan: [], deleted: 0 };
  }

  log(`📋  ${bookings.length} réservation(s) trouvée(s) :\n`);
  for (const b of bookings) {
    const date = b.createdAt ? new Date(b.createdAt).toLocaleDateString("fr-FR") : "—";
    const client = `${b.clientInfo?.firstName || ""} ${b.clientInfo?.lastName || ""}`.trim() || "—";
    log(`     • ${b.reference || b._id}  ·  ${b.type}  ·  ${b.status}  ·  ${date}  ·  ${client}`);
  }

  const bookingIds  = bookings.map((b) => b._id);
  const bookingStrs = bookingIds.map((id) => id.toString());

  // ── 4. Tout ce qui dépend de ces réservations ────────────────────────────
  const liens = [
    { label: "Paiements",              name: "payments",              filter: { booking: { $in: bookingIds } } },
    { label: "Reçus / contrats",       name: "contracts",             filter: { booking: { $in: bookingIds } } },
    { label: "Factures",               name: "invoices",              filter: { booking: { $in: bookingIds } } },
    { label: "Factures de prestation", name: "serviceinvoices",       filter: { booking: { $in: bookingIds } } },
    { label: "Avis",                   name: "reviews",               filter: { booking: { $in: bookingIds } } },
    { label: "Points de fidélité",     name: "loyaltytransactions",   filter: { booking: { $in: bookingIds } } },
    { label: "Conversations",          name: "chats",                 filter: { booking: { $in: bookingIds } } },
    { label: "Journaux d'entretien",   name: "vehiclemaintenancelogs",filter: { booking: { $in: bookingIds } } },
    { label: "Reversements (commissions)", name: "commissionledgers", filter: { transactionId: { $in: bookingStrs }, transactionType: "booking" } },
    // Les notifications ne référencent la réservation que par son lien.
    { label: "Notifications liées",    name: "notifications",         filter: { lien: { $in: bookingStrs.map((id) => new RegExp(id)) } } },
  ];

  log(`\n🔗  Éléments rattachés :\n`);
  const plan = [];
  for (const l of liens) {
    const n = await col(l.name).countDocuments(l.filter).catch(() => 0);
    if (n > 0) plan.push({ ...l, n });
    log(`     ${String(n).padStart(4)}  ${l.label}`);
  }

  if (!CONFIRM) {
    log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`  🔍 SIMULATION — rien n'a été supprimé.`);
    log(`  Pour appliquer réellement cette suppression DÉFINITIVE :`);
    log(`\n     node server/scripts/purgePartnerBookings.js ${TARGET} --confirm`);
    log(`\n  Le compte du partenaire, ses annonces et ses véhicules ne sont`);
    log(`  pas concernés — seul l'historique de réservations est purgé.`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    return { partner, bookings, plan, deleted: 0 };
  }

  // ── 5. Suppression ───────────────────────────────────────────────────────
  log(`\n⏳  Suppression en cours…\n`);
  for (const l of plan) {
    const { deletedCount } = await col(l.name).deleteMany(l.filter);
    log(`     ✔ ${String(deletedCount).padStart(4)}  ${l.label}`);
  }
  const { deletedCount } = await col("bookings").deleteMany({ _id: { $in: bookingIds } });
  log(`     ✔ ${String(deletedCount).padStart(4)}  Réservations`);

  // Les véhicules gardent une disponibilité calculée depuis les réservations
  // actives : sans ce nettoyage, un véhicule pourrait rester marqué occupé par
  // une réservation qui n'existe plus.
  await col("vehicles").updateMany({ _id: { $in: vehicleIds } }, { $set: { available: true } });
  log(`     ✔ Disponibilité des véhicules réinitialisée`);

  log(`\n✅  Historique de réservations purgé.`);
  log(`   Le compte, les annonces et les véhicules du partenaire sont intacts.\n`);

  return { partner, bookings, plan, deleted: deletedCount };
}

// ── Ligne de commande ────────────────────────────────────────────────────────
// N'agit que lorsque le fichier est exécuté directement (jamais à l'import,
// pour que la suite de tests puisse charger la fonction sans se connecter à la
// base de production).
if (process.argv[1] && process.argv[1].endsWith("purgePartnerBookings.js")) {
  const TARGET  = process.argv[2];
  const CONFIRM = process.argv.includes("--confirm");

  if (!TARGET) {
    console.error("\n❌  Précisez l'email OU le nom d'entreprise du partenaire.");
    console.error("    node server/scripts/purgePartnerBookings.js contact@exemple.com");
    console.error("    node server/scripts/purgePartnerBookings.js BENTCHICHCAR --confirm\n");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI non défini (server/.env).");
    process.exit(1);
  }

  mongoose.connect(uri)
    .then(() => purgePartnerBookings({ target: TARGET, confirm: CONFIRM }))
    .then(async (r) => {
      await mongoose.disconnect();
      if (!r.partner) process.exit(1);
    })
    .catch(async (err) => {
      console.error("❌ ", err.message);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
}
