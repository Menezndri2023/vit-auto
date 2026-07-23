import logger from "../utils/logger.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";
import ServiceRequest from "../models/ServiceRequest.js";
import InsuranceRequest from "../models/InsuranceRequest.js";
import IETransaction from "../models/IETransaction.js";
import Notification from "../models/Notification.js";
import AuditLog from "../models/AuditLog.js";
import { initiateCheckout, stripeProvider, waveProvider, orangeMoneyProvider } from "../services/payment/gateway.js";
import { completeIEEscrowPayment } from "./ieTransactionController.js";
import { dispatch } from "../queue/index.js";
import { captureException } from "../config/sentry.js";

// Trace un changement d'état financier (webhook fournisseur ou simulation
// sandbox) — ces événements n'ont pas de req.user (appels serveur-à-serveur),
// donc on log directement plutôt que via logAction(req, ...). Ne doit jamais
// bloquer le webhook si l'écriture échoue.
async function logPaymentEvent(action, payment, source) {
  try {
    await AuditLog.create({
      userId: null,
      userRole: "system",
      action,
      resource: "Payment",
      resourceId: payment._id?.toString?.() ?? null,
      changes: { after: { status: payment.status, amount: payment.amount, method: payment.method, source } },
      success: true,
    });
  } catch (err) {
    logger.error("logPaymentEvent:", err.message);
  }
}

// Moyens de paiement disponibles au choix du client pour les services
// domestiques (location/vente/essai/chauffeur/assurance/services) — carte,
// espèces et mobile money international. Espèces exclu volontairement du
// flux Import/Export (achat international, voir ieTransactionController.js/
// IETransactionTracking.jsx — virement/mobile_money/crypto/lc uniquement, pas
// de remise en main propre possible pour un container à l'international).
const ALLOWED_METHODS = ["card", "cash", "orange_money", "wave", "mtn", "moov", "paypal"];
const ONLINE_METHODS  = ["card", "orange_money", "wave"];

// ── Helpers partagés (webhooks + simulation) ────────────────────────────────
// Cible d'un paiement — exactement un des trois (voir Payment.pre("validate")).
// ServiceRequest/InsuranceRequest couvrent le paiement d'un devis approuvé
// (assurance, transport, garantie...), qui n'avait auparavant aucun moyen de
// règlement depuis l'interface client.
async function resolvePaymentTarget(payment) {
  if (payment.booking)           return { type: "booking",           doc: await Booking.findById(payment.booking).populate("vehicle", "title") };
  if (payment.serviceRequest)    return { type: "serviceRequest",    doc: await ServiceRequest.findById(payment.serviceRequest) };
  if (payment.insuranceRequest)  return { type: "insuranceRequest",  doc: await InsuranceRequest.findById(payment.insuranceRequest) };
  return { type: null, doc: null };
}

// Propriétaire de la cible (client) — utilisé pour les contrôles d'accès de
// getPaymentStatus/simulatePayment, génériques aux 3 types de cible.
async function getTargetOwnerId(payment) {
  if (payment.booking)          return (await Booking.findById(payment.booking).select("client"))?.client ?? null;
  if (payment.serviceRequest)   return (await ServiceRequest.findById(payment.serviceRequest).select("client"))?.client ?? null;
  if (payment.insuranceRequest) return (await InsuranceRequest.findById(payment.insuranceRequest).select("client"))?.client ?? null;
  return null;
}

async function completePayment(payment, { providerRef, source = payment.method } = {}) {
  if (payment.status === "completed") return payment; // idempotent — un webhook peut être renvoyé plusieurs fois
  payment.status = "completed";
  if (providerRef) payment.transactionId = providerRef;
  payment.webhookReceivedAt = new Date();
  await payment.save();
  logPaymentEvent("payment.completed", payment, source);

  const { type, doc } = await resolvePaymentTarget(payment);

  if (type === "booking" && doc && !doc.isPaid) {
    const booking = doc;
    booking.isPaid = true;
    booking.paidAt = new Date();
    await booking.save();
    if (booking.client) {
      await Notification.create({
        user: booking.client,
        type: "payment_received",
        titre: "💳 Paiement confirmé",
        message: `Votre paiement pour la réservation ${booking.reference || ""} a été confirmé.`,
        lien: `/bookings/${booking._id}`,
      }).catch(() => {});
    }

    // Reçu PDF automatique par email — même mécanisme que pour le règlement
    // en espèces (bookingController.validateTransaction). Le sous-objet
    // `transaction.paymentMethod` n'est renseigné que par le workflow partenaire
    // (recordTransaction) : pour un paiement en ligne on retombe sur la méthode
    // réelle du Payment pour que le reçu affiche le bon mode de règlement.
    const bookingForReceipt = booking.transaction?.paymentMethod
      ? booking
      : { ...booking.toObject(), transaction: { ...(booking.transaction?.toObject?.() || booking.transaction), paymentMethod: payment.method } };
    dispatch.transactionReceiptReady(bookingForReceipt, booking.clientInfo?.email, booking.client).catch(() => {});
  } else if (type === "serviceRequest" && doc && !doc.isPaid) {
    doc.isPaid = true;
    doc.paidAt = new Date();
    await doc.save();
    await Notification.create({
      user: doc.client,
      type: "payment_received",
      titre: "💳 Paiement confirmé",
      message: `Votre paiement pour la demande de service (${doc.category}) a été confirmé.`,
      lien: `/services/${doc.category}`,
    }).catch(() => {});
  } else if (type === "insuranceRequest" && doc && !doc.isPaid) {
    doc.isPaid = true;
    doc.paidAt = new Date();
    await doc.save();
    await Notification.create({
      user: doc.client,
      type: "payment_received",
      titre: "💳 Paiement confirmé",
      message: "Votre paiement de la prime d'assurance a été confirmé.",
      lien: "/insurance-request",
    }).catch(() => {});
  }
  return payment;
}

async function failPayment(payment, reason) {
  if (payment.status === "completed") return payment; // ne jamais rétrograder un paiement déjà confirmé
  payment.status = "failed";
  payment.webhookReceivedAt = new Date();
  await payment.save();
  logPaymentEvent("payment.failed", payment, reason);

  const { doc } = await resolvePaymentTarget(payment);
  if (doc?.client) {
    const isBooking = !!payment.booking;
    await Notification.create({
      user: doc.client,
      type: "payment_failed",
      titre: "❌ Paiement échoué",
      message: isBooking
        ? `Le paiement pour la réservation ${doc.reference || ""} a échoué${reason ? ` (${reason})` : ""}. Vous pouvez réessayer.`
        : `Le paiement de votre devis a échoué${reason ? ` (${reason})` : ""}. Vous pouvez réessayer.`,
      lien: isBooking ? `/bookings/${doc._id}` : "/dashboard",
    }).catch(() => {});
  }
  return payment;
}

// ── Initier un paiement en ligne (carte/Orange Money/Wave) ──────────────────
// Cible : bookingId (réservation) OU serviceRequestId/insuranceRequestId (devis
// approuvé — voir Payment.serviceRequest/insuranceRequest). Exactement une des
// trois doit être fournie.
export const initiatePayment = async (req, res) => {
  try {
    const { bookingId, serviceRequestId, insuranceRequestId, method } = req.body;
    if (!ONLINE_METHODS.includes(method)) {
      return res.status(400).json({ message: `Méthode non prise en charge par le paiement en ligne. Acceptées : ${ONLINE_METHODS.join(", ")}` });
    }
    const targetCount = [bookingId, serviceRequestId, insuranceRequestId].filter(Boolean).length;
    if (targetCount !== 1) {
      return res.status(400).json({ message: "Fournissez exactement une cible : bookingId, serviceRequestId ou insuranceRequestId." });
    }

    let target, amount, devise, ownerId, paymentField, notFoundMsg, alreadyPaidMsg;
    if (bookingId) {
      target = await Booking.findById(bookingId);
      notFoundMsg = "Réservation introuvable.";
      alreadyPaidMsg = "Cette réservation est déjà payée.";
      paymentField = "booking";
      if (target) {
        if (target.isPaid) return res.status(409).json({ message: alreadyPaidMsg });
        amount = target.montantTotal; devise = target.devise; ownerId = target.client;
      }
    } else if (serviceRequestId) {
      target = await ServiceRequest.findById(serviceRequestId);
      notFoundMsg = "Demande de service introuvable.";
      alreadyPaidMsg = "Ce devis est déjà payé.";
      paymentField = "serviceRequest";
      if (target) {
        if (target.status !== "approved" || target.quotedAmountUSD == null) {
          return res.status(409).json({ message: "Cette demande n'a pas encore de devis approuvé." });
        }
        if (target.isPaid) return res.status(409).json({ message: alreadyPaidMsg });
        amount = target.quotedAmountUSD; devise = "USD"; ownerId = target.client;
      }
    } else {
      target = await InsuranceRequest.findById(insuranceRequestId);
      notFoundMsg = "Demande d'assurance introuvable.";
      alreadyPaidMsg = "Cette prime est déjà payée.";
      paymentField = "insuranceRequest";
      if (target) {
        if (target.status !== "approved" || target.premium == null) {
          return res.status(409).json({ message: "Cette demande n'a pas encore de prime approuvée." });
        }
        if (target.isPaid) return res.status(409).json({ message: alreadyPaidMsg });
        amount = target.premium; devise = target.devise; ownerId = target.client;
      }
    }
    if (!target) return res.status(404).json({ message: notFoundMsg });

    // Si la cible appartient à un compte (pas une réservation invité), exiger
    // d'être authentifié en tant que ce client (ou admin) — ne rejette QUE si
    // req.user est présent ET ne correspond pas, sinon un appel anonyme (sans
    // en-tête Authorization) passerait sur la ressource d'un compte réel.
    if (ownerId && (!req.user || (req.user.role !== "admin" && ownerId.toString() !== req.user._id.toString()))) {
      return res.status(403).json({ message: "Accès refusé. Vous ne pouvez payer que vos propres demandes." });
    }

    let payment = await Payment.findOne({ [paymentField]: target._id, status: { $in: ["pending", "completed"] } });
    if (payment?.status === "completed") {
      return res.status(409).json({ message: alreadyPaidMsg });
    }
    if (!payment) {
      payment = await Payment.create({
        [paymentField]: target._id,
        amount,
        devise: devise || "USD",
        method,
        status: "pending",
      });
      if (paymentField === "booking") {
        target.payment = payment._id;
        await target.save();
      }
    }

    // Les fournisseurs (stripe/wave/orangeMoney) n'utilisent que `.reference`
    // (avec repli sur l'ID) et `._id` du second argument — une réservation
    // réelle ou un objet minimal font également l'affaire pour un devis.
    const bookingArg = paymentField === "booking" ? target : { _id: target._id, reference: target._id.toString().slice(-8).toUpperCase() };
    const { checkoutUrl, providerRef, simulated } = await initiateCheckout({ payment, booking: bookingArg });
    payment.checkoutUrl   = checkoutUrl;
    payment.transactionId = providerRef;
    payment.simulated     = simulated;
    await payment.save();

    res.json({ checkoutUrl, paymentId: payment._id, simulated });
  } catch (err) {
    logger.error("initiatePayment:", err);
    captureException(err, { controller: "paymentController.initiatePayment", body: req.body });
    res.status(500).json({ message: "Erreur lors de l'initialisation du paiement." });
  }
};

// ── Statut d'un paiement (page de retour après redirection) ────────────────
export const getPaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).select("status simulated amount devise method booking serviceRequest insuranceRequest");
    if (!payment) return res.status(404).json({ message: "Paiement introuvable." });

    // Contrairement à ses routes sœurs (initiatePayment/simulatePayment), cette
    // route ne vérifiait aucune propriété — n'importe qui connaissant/devinant
    // un ObjectId de Payment pouvait consulter son montant, sa méthode et son
    // statut. Même garde que simulatePayment : exige d'être le client de la
    // cible (ou admin) dès qu'elle appartient à un compte ; une réservation
    // invité (sans client) reste consultable par quiconque détient l'ID,
    // comme pour le reste du flux de paiement invité.
    const ownerId = await getTargetOwnerId(payment);
    if (ownerId && (!req.user || (req.user.role !== "admin" && ownerId.toString() !== req.user._id.toString()))) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    res.json({ payment });
  } catch (err) {
    logger.error("getPaymentStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Simuler l'issue d'un paiement (mode sandbox uniquement) ────────────────
export const simulatePayment = async (req, res) => {
  try {
    const { outcome } = req.body; // "success" | "fail"
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Paiement introuvable." });
    if (!payment.simulated) {
      return res.status(403).json({ message: "Ce paiement utilise un vrai fournisseur — impossible de le simuler." });
    }
    if (payment.status !== "pending") {
      return res.status(409).json({ message: "Ce paiement n'est plus en attente." });
    }

    // Route non authentifiée à l'origine : n'importe qui connaissant/devinant
    // un ObjectId de Payment pouvait marquer la cible d'un tiers comme payée
    // gratuitement. Même garde que initiatePayment ci-dessus — exige d'être
    // le client de la cible (ou admin) dès qu'elle appartient à un compte ;
    // une réservation invité (sans client) reste simulable par quiconque
    // détient l'ID, comme n'importe quel flux de paiement invité.
    const ownerId = await getTargetOwnerId(payment);
    if (ownerId && (!req.user || (req.user.role !== "admin" && ownerId.toString() !== req.user._id.toString()))) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    if (outcome === "success") await completePayment(payment, { providerRef: `sim_${payment._id}`, source: "simulation" });
    else await failPayment(payment, "simulated_failure");

    res.json({ status: payment.status });
  } catch (err) {
    logger.error("simulatePayment:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Webhooks fournisseurs ────────────────────────────────────────────────────
export const stripeWebhook = async (req, res) => {
  try {
    const event = stripeProvider.verifyWebhookSignature(req.body, req.headers["stripe-signature"]);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const paymentId = session.metadata?.paymentId || session.client_reference_id;
      const payment = paymentId && await Payment.findById(paymentId);
      if (payment) {
        await completePayment(payment, { providerRef: session.id, source: "stripe_webhook" });
      } else if (paymentId) {
        // Aucun Payment (flux réservation classique) trouvé pour cet ID — il
        // s'agit peut-être d'un escrow Import/Export, qui n'utilise pas le
        // modèle Payment (voir ieTransactionController.payEscrow).
        const tx = await IETransaction.findById(paymentId);
        if (tx) await completeIEEscrowPayment(tx, session.id);
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const paymentId = session.metadata?.paymentId || session.client_reference_id;
      const payment = paymentId && await Payment.findById(paymentId);
      if (payment) await failPayment(payment, "session_expired");
    }
    res.json({ received: true });
  } catch (err) {
    logger.error("stripeWebhook:", err.message);
    captureException(err, { controller: "paymentController.stripeWebhook" });
    res.status(400).json({ message: "Webhook invalide." });
  }
};

export const waveWebhook = async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
    const event = waveProvider.verifyWebhookSignature(rawBody, req.headers["wave-signature"]);
    const paymentId = event.client_reference;
    const payment = paymentId && await Payment.findById(paymentId);
    if (payment) {
      if (event.payment_status === "succeeded" || event.checkout_status === "complete") {
        await completePayment(payment, { providerRef: event.id, source: "wave_webhook" });
      } else if (event.payment_status === "failed" || event.checkout_status === "expired") {
        await failPayment(payment, event.payment_status || event.checkout_status);
      }
    }
    res.json({ received: true });
  } catch (err) {
    logger.error("waveWebhook:", err.message);
    captureException(err, { controller: "paymentController.waveWebhook" });
    res.status(400).json({ message: "Webhook invalide." });
  }
};

export const orangeMoneyWebhook = async (req, res) => {
  try {
    const body = orangeMoneyProvider.verifyWebhookPayload(req.body);
    const payment = await Payment.findById(body.order_id);
    if (payment) {
      if (["SUCCESS", "SUCCESSFUL"].includes(String(body.status).toUpperCase())) {
        await completePayment(payment, { providerRef: body.txnid || body.order_id, source: "orange_money_webhook" });
      } else {
        await failPayment(payment, body.status);
      }
    }
    res.json({ received: true });
  } catch (err) {
    logger.error("orangeMoneyWebhook:", err.message);
    captureException(err, { controller: "paymentController.orangeMoneyWebhook" });
    res.status(400).json({ message: "Webhook invalide." });
  }
};

// ── Créer un enregistrement de paiement ─────────────────────────────────────
export const createPayment = async (req, res) => {
  try {
    const { booking: bookingId, amount: rawAmount, method, mobileNumber, cardLast4, cardHolder, provider } = req.body;
    const amount = Number(rawAmount);

    // Validation stricte des champs requis
    if (!bookingId)          return res.status(400).json({ message: "bookingId requis." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Montant invalide." });
    if (!method || !ALLOWED_METHODS.includes(method))
      return res.status(400).json({ message: `Méthode de paiement invalide. Acceptées : ${ALLOWED_METHODS.join(", ")}` });

    // Vérifier que la réservation existe et n'est pas déjà payée
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
    if (booking.isPaid) return res.status(409).json({ message: "Cette réservation est déjà payée." });

    // Vérifier la propriété : si la réservation a un client assigné, seul ce client (ou un admin) peut payer
    if (booking.client) {
      if (!req.user) {
        return res.status(401).json({ message: "Connectez-vous pour payer cette réservation." });
      }
      if (req.user.role !== "admin" && booking.client.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Accès refusé. Vous ne pouvez payer que vos propres réservations." });
      }
    }

    // Vérifier que le montant correspond au montant attendu (± 0.01 USD pour arrondi)
    if (Math.abs(amount - booking.montantTotal) > 0.01) {
      return res.status(400).json({
        message: `Montant incorrect. Attendu : ${booking.montantTotal} ${booking.devise || "USD"}, reçu : ${amount} ${booking.devise || "USD"}.`,
      });
    }

    // Construire les détails de paiement sans données sensibles en clair
    const paymentDetails = {};
    if (["orange_money", "wave", "mtn", "moov"].includes(method) && mobileNumber) {
      paymentDetails.mobileNumber = mobileNumber.replace(/\d(?=\d{2})/g, "*"); // masquer sauf 2 derniers chiffres
      paymentDetails.provider = method;
    }
    if (method === "card") {
      // Le client ne transmet déjà plus que les 4 derniers chiffres (troncature
      // faite dans le navigateur) — le numéro complet ne doit jamais atteindre
      // le serveur, sans quoi la plateforme entrerait inutilement dans le
      // périmètre PCI-DSS.
      paymentDetails.cardLast4 = cardLast4 ? String(cardLast4).slice(-4) : null;
      paymentDetails.cardHolder = cardHolder || null;
      paymentDetails.provider = provider || "card";
    }

    // Empêche la création de plusieurs paiements en attente pour la même réservation
    // (double-clic/retry) — condition unique appliquée aussi en base (index ci-dessous).
    const existingPending = await Payment.findOne({ booking: bookingId, status: { $in: ["pending", "completed"] } });
    if (existingPending) {
      return res.status(409).json({ message: "Un paiement est déjà enregistré pour cette réservation." });
    }

    // Aucun prestataire de paiement réel n'est branché à ce jour (pas de vérification
    // cryptographique de webhook) : on enregistre la demande en "pending" plutôt que de
    // confirmer automatiquement la réservation. Un partenaire/admin doit valider la
    // réception réelle des fonds via recordTransaction/partnerConfirm avant confirmation.
    const payment = await Payment.create({
      booking: bookingId,
      amount,
      devise:  booking.devise || "USD",
      method,
      status:  "pending",
      paymentDetails,
    });

    booking.payment = payment._id;
    await booking.save();

    res.status(202).json({
      payment,
      booking: { _id: booking._id, status: booking.status, isPaid: false },
      message: "Paiement enregistré, en attente de confirmation par le partenaire.",
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Un paiement est déjà enregistré pour cette réservation." });
    }
    logger.error("createPayment:", err);
    captureException(err, { controller: "paymentController.createPayment", bookingId: req.body?.booking });
    res.status(500).json({ message: "Erreur serveur lors du paiement." });
  }
};

// ── Obtenir les paiements d'une réservation (auth) ───────────────────────────
export const getBookingPayment = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId).populate("payment");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });

    const isOwner  = booking.client?.toString() === req.user._id.toString();
    const isAdmin  = req.user.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Accès refusé." });

    res.json({ payment: booking.payment || null });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};
