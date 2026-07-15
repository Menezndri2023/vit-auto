import logger from "../utils/logger.js";
import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver  from "../models/Driver.js";
import User    from "../models/User.js";
import Notification from "../models/Notification.js";
import { dispatch } from "../queue/index.js";

// ── Génération référence facture ───────────────────────────────────────────────
async function generateInvoiceReference(year) {
  const pattern = new RegExp(`^FACT-${year}-`);
  const count   = await Invoice.countDocuments({ reference: { $regex: pattern } });
  return `FACT-${year}-${String(count + 1).padStart(6, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GÉNÉRER FACTURE MENSUELLE PARTENAIRE (Admin ou auto)
// ═══════════════════════════════════════════════════════════════════════════════
export const generatePartnerInvoice = async (req, res) => {
  try {
    const { partnerId, month, year } = req.body;

    if (!partnerId || !month || !year) {
      return res.status(400).json({ message: "partnerId, month et year requis." });
    }
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json({ message: "partnerId invalide." });
    }

    // Vérifier que le partnerId correspond à un utilisateur partenaire réel
    const partner = await User.findById(partnerId).select("role isActive email firstName lastName");
    if (!partner || !["partenaire", "admin"].includes(partner.role)) {
      return res.status(404).json({ message: "Partenaire introuvable ou rôle invalide." });
    }
    if (!partner.isActive) {
      return res.status(403).json({ message: "Ce compte partenaire est inactif." });
    }

    // Vérifier si une facture existe déjà
    const existing = await Invoice.findOne({ partner: partnerId, month, year });
    if (existing) {
      return res.status(409).json({ message: "Une facture existe déjà pour ce partenaire et cette période.", invoice: existing });
    }

    // Récupérer les véhicules et chauffeurs du partenaire
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find({ owner: partnerId }).select("_id"),
      Driver.find({ owner: partnerId }).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);

    // Toutes les commandes terminées du mois, non encore facturées
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 1);

    const bookings = await Booking.find({
      $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }],
      status:    "completed",
      invoiced:  false,
      paidAt:    { $gte: startOfMonth, $lt: endOfMonth },
    }).select("reference type transaction montantTotal commissionAmount commissionRate devise paidAt");

    if (bookings.length === 0) {
      return res.status(404).json({ message: "Aucune transaction facturée à générer pour cette période." });
    }

    // Construire les lignes de facture
    const lines = bookings.map((b) => ({
      booking:            b._id,
      bookingRef:         b.reference || b._id.toString(),
      serviceType:        b.type,
      montantTransaction: b.transaction?.finalAmount || b.montantTotal || 0,
      commissionRate:     b.commissionRate || 0,
      commissionAmount:   b.commissionAmount || 0,
      devise:             b.devise || "XOF",
      completedAt:        b.paidAt,
    }));

    const totalCommission = lines.reduce((s, l) => s + l.commissionAmount, 0);

    const reference = await generateInvoiceReference(year);
    const dueDate   = new Date(year, month, 15);  // 15 du mois suivant

    const invoice = await Invoice.create({
      reference,
      partner: partnerId,
      month,
      year,
      lines,
      totalCommission,
      devise: "XOF",
      status: "pending",
      dueDate,
    });

    // Marquer les commandes comme facturées
    await Booking.updateMany(
      { _id: { $in: bookings.map((b) => b._id) } },
      { invoiced: true, invoice: invoice._id }
    );

    // Notifier le partenaire
    await Notification.create({
      user:    partnerId,
      type:    "system",
      titre:   "📄 Nouvelle facture disponible",
      message: `Votre facture ${reference} de ${Number(totalCommission).toLocaleString("fr-FR")} XOF est disponible. Échéance : ${dueDate.toLocaleDateString("fr-FR")}.`,
      lien:    "/vendor/dashboard",
    }).catch(() => {});

    // Envoi email de la facture PDF en pièce jointe
    if (partner.email) {
      dispatch.partnerInvoiceReady(invoice, partner.email, partnerId, partner.firstName).catch(() => {});
    }

    res.status(201).json({ invoice, message: `Facture ${reference} générée avec ${lines.length} transaction(s).` });
  } catch (err) {
    logger.error("generatePartnerInvoice:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GÉNÉRER LES FACTURES DE TOUS LES PARTENAIRES (Admin — fin de mois)
// ═══════════════════════════════════════════════════════════════════════════════
export const generateAllMonthlyInvoices = async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ message: "month et year requis." });

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 1);

    // Trouver tous les partenaires avec des transactions complètes ce mois
    const bookings = await Booking.find({
      status:   "completed",
      invoiced: false,
      paidAt:   { $gte: startOfMonth, $lt: endOfMonth },
    })
      .populate("vehicle", "owner")
      .populate("driver",  "owner");

    // Grouper par partenaire
    const byPartner = new Map();
    for (const b of bookings) {
      const ownerId = (b.vehicle?.owner || b.driver?.owner)?.toString();
      if (!ownerId) continue;
      if (!byPartner.has(ownerId)) byPartner.set(ownerId, []);
      byPartner.get(ownerId).push(b);
    }

    const results = [];
    for (const [partnerId, pBookings] of byPartner) {
      const existing = await Invoice.findOne({ partner: partnerId, month, year });
      if (existing) { results.push({ partnerId, status: "already_exists", reference: existing.reference }); continue; }

      const lines = pBookings.map((b) => ({
        booking:            b._id,
        bookingRef:         b.reference || b._id.toString(),
        serviceType:        b.type,
        montantTransaction: b.transaction?.finalAmount || b.montantTotal || 0,
        commissionRate:     b.commissionRate || 0,
        commissionAmount:   b.commissionAmount || 0,
        devise:             b.devise || "XOF",
        completedAt:        b.paidAt,
      }));

      const totalCommission = lines.reduce((s, l) => s + l.commissionAmount, 0);
      const reference       = await generateInvoiceReference(year);
      const dueDate         = new Date(year, month, 15);

      const invoice = await Invoice.create({
        reference,
        partner: partnerId,
        month,
        year,
        lines,
        totalCommission,
        devise: "XOF",
        status: "pending",
        dueDate,
      });

      await Booking.updateMany(
        { _id: { $in: pBookings.map((b) => b._id) } },
        { invoiced: true, invoice: invoice._id }
      );

      await Notification.create({
        user:    partnerId,
        type:    "system",
        titre:   "📄 Nouvelle facture disponible",
        message: `Votre facture ${reference} de ${Number(totalCommission).toLocaleString("fr-FR")} XOF est disponible.`,
        lien:    "/vendor/dashboard",
      }).catch(() => {});

      // Envoi email de la facture PDF en pièce jointe
      const partner = await User.findById(partnerId).select("email firstName");
      if (partner?.email) {
        dispatch.partnerInvoiceReady(invoice, partner.email, partnerId, partner.firstName).catch(() => {});
      }

      results.push({ partnerId, status: "created", reference, totalCommission, lines: lines.length });
    }

    res.json({ generated: results.filter((r) => r.status === "created").length, results });
  } catch (err) {
    logger.error("generateAllMonthlyInvoices:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FACTURES DU PARTENAIRE CONNECTÉ
// ═══════════════════════════════════════════════════════════════════════════════
export const getMyInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ partner: req.user._id })
      .sort({ year: -1, month: -1 })
      .lean();
    res.json({ invoices });
  } catch (err) {
    logger.error("getMyInvoices:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. TOUTES LES FACTURES (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════
export const getAllInvoices = async (req, res) => {
  try {
    const { status, year, month, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (year)   filter.year   = Number(year);
    if (month)  filter.month  = Number(month);

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ year: -1, month: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate("partner", "firstName lastName email phone"),
      Invoice.countDocuments(filter),
    ]);

    // Totaux globaux
    const allCompleted = await Invoice.find({ status: "paid" }).select("totalCommission");
    const allPending   = await Invoice.find({ status: "pending" }).select("totalCommission");
    const totalPaid    = allCompleted.reduce((s, i) => s + (i.totalCommission || 0), 0);
    const totalPending = allPending.reduce((s, i) => s + (i.totalCommission || 0), 0);

    res.json({ invoices, total, pages: Math.ceil(total / limit), totalPaid, totalPending });
  } catch (err) {
    logger.error("getAllInvoices:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MARQUER UNE FACTURE COMME PAYÉE (Admin)
// ═══════════════════════════════════════════════════════════════════════════════
export const markInvoicePaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Facture introuvable." });
    }

    const invoice = await Invoice.findById(id).populate("partner", "firstName lastName email");
    if (!invoice) return res.status(404).json({ message: "Facture introuvable." });
    if (invoice.status === "paid") return res.status(409).json({ message: "Cette facture est déjà payée." });

    invoice.status        = "paid";
    invoice.paidAt        = new Date();
    invoice.paymentMethod = paymentMethod || "virement";
    invoice.notes         = notes || null;
    await invoice.save();

    // Notifier le partenaire
    await Notification.create({
      user:    invoice.partner._id,
      type:    "system",
      titre:   "✅ Facture réglée",
      message: `Votre facture ${invoice.reference} a été marquée comme payée.`,
      lien:    "/vendor/dashboard",
    }).catch(() => {});

    res.json({ invoice, message: "Facture marquée comme payée." });
  } catch (err) {
    logger.error("markInvoicePaid:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. TRANSACTIONS PARTENAIRE (pour onglet Transactions)
// ═══════════════════════════════════════════════════════════════════════════════
export const getPartnerTransactions = async (req, res) => {
  try {
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find({ owner: req.user._id }).select("_id"),
      Driver.find({ owner: req.user._id }).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);

    const bookings = await Booking.find({
      $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }],
      status: { $in: ["completed", "disputed", "waiting_client_validation", "transaction_concluded", "transaction_not_concluded"] },
    })
      .sort({ updatedAt: -1 })
      .select("reference type status montantTotal commissionAmount commissionRate partnerPayout transaction clientInfo paidAt updatedAt invoiced devise")
      .lean();

    res.json({ transactions: bookings });
  } catch (err) {
    logger.error("getPartnerTransactions:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. COMMISSIONS ADMIN — vue globale
// ═══════════════════════════════════════════════════════════════════════════════
export const getAdminCommissions = async (req, res) => {
  try {
    const { year, month } = req.query;
    const filter = { status: "completed" };
    if (year || month) {
      const y = year ? Number(year) : new Date().getFullYear();
      const m = month ? Number(month) - 1 : 0;
      const start = month ? new Date(y, m, 1) : new Date(y, 0, 1);
      const end   = month ? new Date(y, m + 1, 1) : new Date(y + 1, 0, 1);
      filter.paidAt = { $gte: start, $lt: end };
    }

    const bookings = await Booking.find(filter)
      .select("reference type commissionAmount commissionRate partnerPayout montantTotal transaction clientInfo paidAt devise invoiced")
      .populate("vehicle", "title owner")
      .populate("driver",  "firstName lastName owner")
      .sort({ paidAt: -1 })
      .lean();

    const totalCommissions = bookings.reduce((s, b) => s + (b.commissionAmount || 0), 0);
    const totalTransactions = bookings.reduce((s, b) => s + (b.transaction?.finalAmount || b.montantTotal || 0), 0);

    res.json({ bookings, totalCommissions, totalTransactions, count: bookings.length });
  } catch (err) {
    logger.error("getAdminCommissions:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
