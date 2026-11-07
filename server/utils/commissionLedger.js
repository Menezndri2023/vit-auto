import CommissionLedger from "../models/CommissionLedger.js";
import Payment from "../models/Payment.js";
import logger from "./logger.js";

// ── Suivi réel des reversements partenaire ──────────────────────────────────
// Bug réel corrigé (audit) : CommissionLedger existait déjà (schéma complet
// pending/confirmed/paid/disputed/cancelled, paidAt, paidViaTxId) mais n'était
// jamais instancié nulle part — une fois une commande "completed", son
// partnerPayout restait compté indéfiniment dans les stats partenaire, sans
// aucune trace de si le virement avait réellement eu lieu. Aucune intégration
// bancaire n'existe (les virements restent initiés manuellement par la
// finance VIT AUTO, comme les remboursements — voir refund_needed) : ceci
// fournit le SUIVI (dû vs déjà versé), pas l'exécution du virement lui-même.
//
// Idempotent (upsert sur transactionId+transactionType) : une commande ne
// peut jamais générer deux entrées, même si "completed" est atteint depuis
// plusieurs chemins (updateBookingStatus / validateTransaction / resolveDispute
// / adminForceComplete).
export async function recordPartnerPayout(booking) {
  try {
    // `activity.owner` manquait : pour une réservation d'activité (vehicle et
    // driver valent null), la fonction sortait ici en silence — le partenaire
    // n'avait AUCUNE ligne "à verser" dans le suivi des reversements, son dû
    // était donc invisible pour lui comme pour l'admin.
    const ownerId = booking.vehicle?.owner?._id || booking.vehicle?.owner
      || booking.driver?.owner?._id || booking.driver?.owner
      || booking.activity?.owner?._id || booking.activity?.owner
      || booking.part?.owner?._id || booking.part?.owner;
    if (!ownerId) return;

    // Sens de la ligne (audit du 2026-11-06). VIT AUTO n'encaisse rien pour
    // compte de tiers (ENCAISSEMENT_TIERS_AUTORISE fermé) : le client règle le
    // partenaire directement, VIT AUTO ne lui doit donc AUCUN reversement — c'est
    // le partenaire qui doit la commission. Chaque réservation terminée créait
    // pourtant un « reversement en attente de virement » du montant partenaire.
    // Seul un paiement réellement encaissé chez un prestataire (terminé, et pas
    // le règlement en espèces sur place, enregistré lui aussi comme Payment)
    // donne un reversement.
    const encaisseParVitAuto = await Payment.exists({
      booking: booking._id, status: { $in: ["completed", "partially_refunded"] }, method: { $ne: "cash" },
    });
    const montant = encaisseParVitAuto ? booking.partnerPayout : booking.commissionAmount;
    if (!montant || montant <= 0) return;
    const ref = booking.reference ? `Réservation ${booking.reference}` : null;

    await CommissionLedger.findOneAndUpdate(
      { transactionId: booking._id.toString(), transactionType: "booking" },
      {
        $setOnInsert: {
          transactionId:    booking._id.toString(),
          transactionType:  "booking",
          partnerId:        ownerId,
          grossAmount:      booking.montantTotal || 0,
          // Booking.commissionRate est une fraction (0.15) — le schéma
          // CommissionLedger attend un pourcentage (15).
          commissionRate:   Math.round((booking.commissionRate || 0) * 10000) / 100,
          commissionAmount: montant,
          currency:         booking.devise || "USD",
          type:             encaisseParVitAuto ? "partner_direct" : "platform_fee",
          status:           "pending",
          notes:            encaisseParVitAuto ? ref : `${ref || "Réservation"} — règlement direct, commission due par le partenaire`,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    logger.error("recordPartnerPayout (non bloquant) :", err.message);
  }
}

// Équivalent de recordPartnerPayout ci-dessus pour l'Import/Export — jamais
// appelé jusqu'ici (bug réel trouvé en audit) : ieTransactionController.js
// (releaseFunds/resolveDispute) calcule bien tx.payment.commission mais
// n'alimentait jamais CommissionLedger, alors que le schéma prévoit
// explicitement transactionType:"import_export". Conséquence : les
// reversements fournisseur Import/Export étaient invisibles dans le suivi
// "dû vs déjà versé" (getMyPayouts/adminListPayouts), sans aucune trace de
// virement effectué. Même garantie d'idempotence (upsert sur
// transactionId+transactionType) qu'au-dessus.
export async function recordIEPartnerPayout(tx) {
  try {
    const partnerId = tx.partner?._id || tx.partner;
    if (!partnerId) return;
    const payoutAmount = tx.payment?.commission?.payoutAmount;
    if (!payoutAmount || payoutAmount <= 0) return;

    await CommissionLedger.findOneAndUpdate(
      { transactionId: tx._id.toString(), transactionType: "import_export" },
      {
        $setOnInsert: {
          transactionId:    tx._id.toString(),
          transactionType:  "import_export",
          partnerId,
          // Part exportateur (voir IETransaction.ventilation), pas le total client.
          grossAmount:      tx.ventilation?.exportateur ?? tx.payment?.amount ?? 0,
          commissionRate:   Math.round((tx.payment?.commission?.rate || 0) * 10000) / 100,
          commissionAmount: payoutAmount,
          currency:         tx.payment?.currency || "USD",
          type:             "partner_direct",
          status:           "pending",
          notes:            `Transaction Import/Export ${tx._id}`,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    logger.error("recordIEPartnerPayout (non bloquant) :", err.message);
  }
}
