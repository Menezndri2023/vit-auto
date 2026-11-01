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
import { encaissementPourTiersOuvert } from "../../config/featureFlags.js";
import { validateDocumentDataUri } from "../../utils/imageValidation.js";
import { uploadDocument, FOLDERS } from "../../config/imagekit.js";

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
const MAX_PREUVE_OCTETS = 8 * 1024 * 1024;

// preuve = { reference, effectueLe?, nom?, fichier? (data URI image/PDF) } —
// null si absente, { erreur } si invalide.
async function preparerPreuve(preuve, paymentId) {
  if (!preuve) return null;
  const reference = String(preuve.reference || "").trim();
  if (!reference) return null;
  if (reference.length > 120) return { erreur: "Référence trop longue (120 caractères au plus)." };
  let effectueLe = new Date();
  if (preuve.effectueLe) {
    effectueLe = new Date(preuve.effectueLe);
    if (Number.isNaN(effectueLe.getTime()) || effectueLe > new Date()) return { erreur: "Date du remboursement invalide (elle ne peut pas être dans le futur)." };
  }
  let fichier = null;
  if (preuve.fichier) {
    const check = validateDocumentDataUri(preuve.fichier, MAX_PREUVE_OCTETS);
    if (!check.ok) return { erreur: check.message };
    const envoi = await uploadDocument(preuve.fichier, `${FOLDERS.docs}/remboursements`, `remboursement_${String(paymentId).slice(-8)}_${Date.now()}`);
    if (!envoi?.url) return { erreur: "Dépôt du justificatif indisponible pour le moment : réessayez, ou enregistrez la référence seule." };
    fichier = { nom: String(preuve.nom || "Justificatif de remboursement").trim().slice(0, 200), url: envoi.url, type: check.detectedType || null };
  }
  return { reference, effectueLe, fichier };
}

export async function refundPayment({ paymentId, amount, reason, actorId = null, actorType = "SYSTEM", preuve = null }) {
  if (!paymentId) return { ok: false, message: "Aucun paiement associé." };
  // Aucune décision AUTOMATIQUE de remboursement tant que l'encaissement pour
  // compte de tiers est fermé (exploitant, 2026-10-31) : une annulation par le
  // client ou le partenaire ne rembourse plus d'elle-même ; elle signale le cas
  // (refund_needed) et l'équipe décide (refundPaymentAdmin, acteur ADMIN). Le
  // paiement n'est pas touché.
  if (actorType !== "ADMIN" && !encaissementPourTiersOuvert()) {
    return { ok: false, decisionRequise: true, message: "Remboursement à décider par l'équipe VIT AUTO." };
  }

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

  // Encaissé par PayDunya : pas de remboursement par API, l'admin rembourse
  // depuis son espace marchand (mode manuel ci-dessous).
  const gatewayConfig = payment.fournisseur === "paydunya" ? null : AUTOMATIC_PROVIDERS[payment.method];
  // Un remboursement partiel demandé sur une méthode qui ne le supporte pas
  // (Wave) retombe en manuel plutôt que de rembourser plus que ce qui a été
  // demandé — jamais de décision financière silencieuse à la place de l'admin.
  const canAutomate = gatewayConfig
    && gatewayConfig.provider.isConfigured()
    && (gatewayConfig.supportsPartial || refundAmount >= remaining);

  // Preuve d'un remboursement manuel (2026-11-01) : sans la référence de
  // l'opération réellement effectuée hors plateforme, rien n'est enregistré —
  // le paiement n'est jamais marqué remboursé sur la seule foi d'un clic.
  const preuveManuelle = await preparerPreuve(preuve, paymentId);
  if (preuveManuelle?.erreur) return { ok: false, message: preuveManuelle.erreur };

  let automatic = false;
  let referenceAuto = null;
  if (canAutomate) {
    try {
      const r = await gatewayConfig.provider.refund({ payment, amount: refundAmount });
      referenceAuto = r?.providerRefundId || null;
      automatic = true;
    } catch (err) {
      logger.error("[refundService] Échec remboursement fournisseur", { paymentId, method: payment.method, error: err.message });
      // Échec réseau/API : rien n'a été remboursé. On ne bascule en manuel que
      // si l'admin fournit la preuve d'un remboursement fait par lui-même.
      if (!preuveManuelle) {
        return { ok: false, preuveRequise: true, message: "Le remboursement automatique a échoué : rien n'a été remboursé ni enregistré. Remboursez hors plateforme puis enregistrez la référence de l'opération." };
      }
    }
  }
  if (!automatic && !preuveManuelle) {
    return { ok: false, preuveRequise: true, message: "Remboursement manuel : indiquez la référence de l'opération effectuée (virement, reçu mobile money…). Rien n'a été enregistré." };
  }

  const newRefundedAmount = Math.round((alreadyRefunded + refundAmount) * 100) / 100;
  const newStatus = newRefundedAmount >= payment.amount ? "refunded" : "partially_refunded";
  const trace = automatic
    ? { montant: refundAmount, mode: "automatique", reference: referenceAuto || `${payment.method}-${Date.now()}`, effectueLe: new Date(), enregistrePar: actorId, motif: reason || null }
    : { montant: refundAmount, mode: "manuel", reference: preuveManuelle.reference, preuve: preuveManuelle.fichier || undefined, effectueLe: preuveManuelle.effectueLe, enregistrePar: actorId, motif: reason || null };

  // Concurrence optimiste : le filtre inclut le montant déjà remboursé lu en
  // tête de fonction — si un autre remboursement s'est glissé entre-temps
  // (autre onglet admin, double-clic), cette écriture échoue proprement au
  // lieu d'écraser silencieusement le montant réel remboursé.
  const updated = await Payment.findOneAndUpdate(
    { _id: paymentId, refundedAmount: alreadyRefunded },
    {
      $set: { status: newStatus, refundedAmount: newRefundedAmount, refundedAt: trace.effectueLe, refundReason: reason || payment.refundReason || null },
      $push: { remboursements: trace },
    },
    { new: true, runValidators: true },
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
    const titre = "💸 Remboursement effectué";
    const message = automatic
      ? `Votre remboursement de ${refundAmount} USD a été traité.`
      : `Votre remboursement de ${refundAmount} USD a été effectué par notre équipe (référence ${trace.reference}).`;
    const notifDoc = await Notification.create({ user: clientId, type: "refund_processed", titre, message, lien: "/dashboard" }).catch(() => null);
    if (notifDoc && global._io) {
      global._io.to(`user_${clientId}`).emit("notification_new", {
        _id: notifDoc._id, type: "refund_processed", titre, message, lien: "/dashboard", lu: false, createdAt: notifDoc.createdAt,
      });
    }
  }

  return { ok: true, automatic, payment: updated };
}
