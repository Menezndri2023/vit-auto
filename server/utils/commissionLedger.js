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
