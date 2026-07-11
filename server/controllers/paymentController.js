import logger from "../utils/logger.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";

const ALLOWED_METHODS = ["card", "orange_money", "wave", "mtn", "moov", "paypal", "cash"];

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

    // Vérifier que le montant correspond au montant attendu (± 1 FCFA pour arrondi)
    if (Math.abs(amount - booking.montantTotal) > 1) {
      return res.status(400).json({
        message: `Montant incorrect. Attendu : ${booking.montantTotal} FCFA, reçu : ${amount} FCFA.`,
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
      devise:  "XOF",
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
