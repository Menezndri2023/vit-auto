import CommissionLedger from "../models/CommissionLedger.js";
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
    const ownerId = booking.vehicle?.owner?._id || booking.vehicle?.owner
      || booking.driver?.owner?._id || booking.driver?.owner;
    if (!ownerId) return;
    if (!booking.partnerPayout || booking.partnerPayout <= 0) return;

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
          commissionAmount: booking.partnerPayout,
          currency:         booking.devise || "USD",
          type:             "partner_direct",
          status:           "pending",
          notes:            booking.reference ? `Réservation ${booking.reference}` : null,
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
          grossAmount:      tx.payment?.amount || 0,
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
