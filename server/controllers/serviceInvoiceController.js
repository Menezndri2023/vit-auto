import logger from "../utils/logger.js";
import ServiceInvoice from "../models/ServiceInvoice.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";

// ── Émettre la facture de prestation au partenaire (appelé depuis
// bookingController dès qu'une commande passe à "completed", aux 5 endroits
// qui déclenchent déjà schedulePostServiceSurvey) — non bloquant, jamais
// appelé directement en HTTP. Idempotent : Booking.review-like, une seule
// facture par commande (index unique sur `booking`).
export async function issueServiceInvoice(booking) {
  try {
    const ownerId = booking.vehicle?.owner?._id || booking.vehicle?.owner || booking.driver?.owner?._id || booking.driver?.owner;
    if (!ownerId) return;

    const existing = await ServiceInvoice.findOne({ booking: booking._id }).select("_id").lean();
    if (existing) return; // déjà émise (relance possible du même statut "completed")

    // Résolution du moyen de paiement réellement utilisé — priorité au
    // règlement manuel enregistré par le partenaire (transaction.paymentMethod,
    // couvre notamment les espèces), sinon le Payment en ligne lié.
    let paymentMethod = booking.transaction?.paymentMethod || null;
    if (!paymentMethod && booking.payment) {
      const pay = await Payment.findById(booking.payment).select("method").lean();
      paymentMethod = pay?.method || null;
    }

    const grossAmount = booking.transaction?.finalAmount ?? booking.montantTotal ?? 0;
    const year = new Date().getFullYear();
    const count = await ServiceInvoice.countDocuments({ reference: new RegExp(`^VIT-SRV-${year}-`) });
    const reference = `VIT-SRV-${year}-${String(count + 1).padStart(6, "0")}`;

    const invoice = await ServiceInvoice.create({
      booking:          booking._id,
      reference,
      partner:          ownerId,
      serviceType:      booking.type,
      bookingReference: booking.reference,
      grossAmount,
      commissionRate:   booking.commissionRate || 0,
      commissionAmount: booking.commissionAmount || 0,
      netPayout:        booking.partnerPayout ?? Math.max(grossAmount - (booking.commissionAmount || 0), 0),
      currency:         booking.devise || "USD",
      paymentMethod,
      serviceCompletedAt: new Date(),
      sentAt: new Date(),
    });

    await Notification.create({
      user: ownerId,
      type: "invoice_available",
      titre: "🧾 Facture de prestation disponible",
      message: `Facture ${reference} pour la commande ${booking.reference || ""} — net à percevoir : ${Number(invoice.netPayout).toLocaleString("fr-FR")} ${invoice.currency}.`,
      lien: "/vendor/dashboard?tab=finances",
    }).catch(() => {});
  } catch (err) {
    logger.error("issueServiceInvoice (non bloquant):", err.message);
  }
}

// ── Mes factures de prestation (partenaire) ──────────────────────────────────
export const getMyServiceInvoices = async (req, res) => {
  try {
    const invoices = await ServiceInvoice.find({ partner: req.user._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ invoices });
  } catch (err) {
    logger.error("getMyServiceInvoices:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Toutes les factures de prestation (admin) ────────────────────────────────
export const getAllServiceInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 30, partnerId } = req.query;
    const filter = {};
    if (partnerId) filter.partner = partnerId;
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * safeLimit;

    const [invoices, total] = await Promise.all([
      ServiceInvoice.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("partner", "firstName lastName email")
        .lean(),
      ServiceInvoice.countDocuments(filter),
    ]);

    res.json({ invoices, total, page: Number(page), pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getAllServiceInvoices:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
