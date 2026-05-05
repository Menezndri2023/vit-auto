import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";

const ALLOWED_METHODS = ["card", "orange_money", "wave", "mtn", "moov", "paypal", "cash"];

// ── Créer un enregistrement de paiement ─────────────────────────────────────
export const createPayment = async (req, res) => {
  try {
    const { booking: bookingId, amount, method, mobileNumber, cardNumber, cardHolder, provider } = req.body;

    // Validation stricte des champs requis
    if (!bookingId)          return res.status(400).json({ message: "bookingId requis." });
    if (!amount || amount <= 0) return res.status(400).json({ message: "Montant invalide." });
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
      // Ne stocker QUE les 4 derniers chiffres
      paymentDetails.cardLast4 = cardNumber ? String(cardNumber).replace(/\s/g, "").slice(-4) : null;
      paymentDetails.cardHolder = cardHolder || null;
      paymentDetails.provider = provider || "card";
    }

    const payment = await Payment.create({
      booking: bookingId,
      amount,
      devise:  "XOF",
      method,
      status:  "completed",     // Statut réel à brancher sur webhook du provider
      paymentDetails,
    });

    // Mettre à jour la réservation
    booking.payment = payment._id;
    booking.isPaid  = true;
    booking.paidAt  = new Date();
    if (booking.status === "pending") booking.status = "confirmed";
    await booking.save();

    res.json({ payment, booking: { _id: booking._id, status: booking.status, isPaid: true } });
  } catch (err) {
    console.error("createPayment:", err);
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
