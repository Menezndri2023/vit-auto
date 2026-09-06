// Booking Engine — Remboursements (2026-09). Point d'entrée UNIQUE pour tout
// remboursement, automatique ou manuel — même principe que
// server/services/bookingActionService.js (Phase 1) : dashboard, annulation
// automatique et résolution de litige appellent tous cette même fonction,
// jamais une logique dupliquée.
import Payment from "../../models/Payment.js";
import Notification from "../../models/Notification.js";
import logger from "../../utils/logger.js";
import * as stripeProvider from "./providers/stripeProvider.js";
import * as waveProvider from "./providers/waveProvider.js";

// Import dynamique pour éviter un cycle (paymentController.js pourrait un
// jour appeler ce service directement) — même pattern que
// bookingActionService.js.
async function getPaymentController() {
  return import("../../controllers/paymentController.js");
}

// method → { provider, supportsPartial }. Tout ce qui n'apparaît pas ici
// (orange_money, cash, mtn, moov, virement, paypal, applepay, test) reste
// toujours manuel — aucune API stable/vérifiable disponible pour ces
// méthodes (voir orangeMoneyProvider.js, qui documente lui-même que le
// contrat varie par pays et n'a jamais pu être testé).
const AUTOMATIC_PROVIDERS = {
  card: { provider: stripeProvider, supportsPartial: true },
  wave: { provider: waveProvider,   supportsPartial: false },
};

/**
 * Rembourse (total ou partiel) un Payment déjà réglé.
 * @param {string} paymentId
 * @param {number} [amount] - montant à rembourser (USD) ; par défaut, tout le solde restant.
 * @param {string} [reason]
 * @param {string} [actorId] - utilisateur à l'origine du remboursement (admin, ou null si automatique).
 * @param {"SYSTEM"|"ADMIN"|"PARTNER"|"CLIENT"} [actorType]
 * @returns {{ ok: boolean, automatic?: boolean, payment?: object, message?: string }}
 */
export async function refundPayment({ paymentId, amount, reason, actorId = null, actorType = "SYSTEM" }) {
  if (!paymentId) return { ok: false, message: "Aucun paiement associé." };

  const payment = await Payment.findById(paymentId);
  if (!payment) return { ok: false, message: "Paiement introuvable." };
  if (!["completed", "partially_refunded"].includes(payment.status)) {
    return { ok: false, message: `Statut actuel du paiement ("${payment.status}") — remboursement impossible.` };
  }

  const alreadyRefunded = payment.refundedAmount || 0;
  const remaining = Math.round((payment.amount - alreadyRefunded) * 100) / 100;
  if (remaining <= 0) {
    return { ok: false, message: "Ce paiement est déjà intégralement remboursé." };
  }
  let refundAmount = amount != null ? Math.min(Number(amount), remaining) : remaining;
  if (!(refundAmount > 0)) return { ok: false, message: "Montant de remboursement invalide." };

  const gatewayConfig = AUTOMATIC_PROVIDERS[payment.method];
  // Un remboursement partiel demandé sur une méthode qui ne le supporte pas
  // (Wave) retombe en manuel plutôt que de rembourser plus que ce qui a été
  // demandé — jamais de décision financière silencieuse à la place de l'admin.
  const canAutomate = gatewayConfig
    && gatewayConfig.provider.isConfigured()
    && (gatewayConfig.supportsPartial || refundAmount >= remaining);

  let automatic = false;
  if (canAutomate) {
    try {
      await gatewayConfig.provider.refund({ payment, amount: refundAmount });
      automatic = true;
    } catch (err) {
      logger.error("[refundService] Échec remboursement fournisseur — repli manuel", { paymentId, method: payment.method, error: err.message });
      // Échec réseau/API : on continue quand même en mode manuel (l'admin
      // devra le traiter lui-même) plutôt que de bloquer toute la fonction —
      // jamais de remboursement perdu silencieusement, l'événement
      // refund_needed (voir bookingController.js) reste émis pour ce cas.
    }
  }

  const newRefundedAmount = Math.round((alreadyRefunded + refundAmount) * 100) / 100;
  const newStatus = newRefundedAmount >= payment.amount ? "refunded" : "partially_refunded";

  // Concurrence optimiste : le filtre inclut le montant déjà remboursé lu en
  // tête de fonction — si un autre remboursement s'est glissé entre-temps
  // (autre onglet admin, double-clic), cette écriture échoue proprement au
  // lieu d'écraser silencieusement le montant réel remboursé.
  const updated = await Payment.findOneAndUpdate(
    { _id: paymentId, refundedAmount: alreadyRefunded },
    { $set: { status: newStatus, refundedAmount: newRefundedAmount, refundedAt: new Date(), refundReason: reason || payment.refundReason || null } },
    { new: true },
  );
  if (!updated) {
    return { ok: false, message: "Ce paiement vient d'être modifié par une autre action — réessayez." };
  }

  logger.info("[refundService] Remboursement enregistré", { paymentId, amount: refundAmount, automatic, actorType, actorId });

  // Notification client — réutilise le type "refund_processed", déjà déclaré
  // dans Notification.js mais jamais utilisé jusqu'ici.
  const { resolvePaymentTarget } = await getPaymentController();
  const { doc } = await resolvePaymentTarget(updated);
  const clientId = doc?.client;
  if (clientId) {
    const titre = automatic ? "💸 Remboursement effectué" : "💸 Remboursement en cours de traitement";
    const message = automatic
      ? `Votre remboursement de ${refundAmount} USD a été traité.`
      : `Votre remboursement de ${refundAmount} USD est en cours de traitement par notre équipe.`;
    const notifDoc = await Notification.create({ user: clientId, type: "refund_processed", titre, message, lien: "/dashboard" }).catch(() => null);
    if (notifDoc && global._io) {
      global._io.to(`user_${clientId}`).emit("notification_new", {
        _id: notifDoc._id, type: "refund_processed", titre, message, lien: "/dashboard", lu: false, createdAt: notifDoc.createdAt,
      });
    }
  }

  return { ok: true, automatic, payment: updated };
}
