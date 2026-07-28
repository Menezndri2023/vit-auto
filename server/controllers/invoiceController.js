import logger from "../utils/logger.js";
import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver  from "../models/Driver.js";
import User    from "../models/User.js";
import Notification from "../models/Notification.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { dispatch } from "../queue/index.js";

// Clé de regroupement stable pour un couple (partenaire, entité) — "none" sert
// de bucket pour les véhicules/chauffeurs sans entité assignée (voir
// Invoice.businessId : null est une valeur d'index à part entière, mais ne
// peut pas servir de clé de Map JS de façon fiable mêlée à des ObjectId).
function groupKey(ownerId, businessId) {
  return `${ownerId}::${businessId || "none"}`;
}

// Une facture existe déjà (index unique {partner, businessId, year, month})
// pour cette combinaison — même situation que le check applicatif juste avant
// (race entre deux requêtes concurrentes, ou ancien index legacy encore
// présent en production tant que scripts/migrateInvoiceBusinessIndex.js n'a
// pas été exécuté). Distingue ce cas d'une vraie panne serveur : 409, pas 500.
function isDuplicateInvoiceError(err) {
  return err?.code === 11000;
}

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
    const { partnerId, month, year, businessId } = req.body;

    if (!partnerId || !month || !year) {
      return res.status(400).json({ message: "partnerId, month et year requis." });
    }
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json({ message: "partnerId invalide." });
    }
    if (businessId && !mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({ message: "businessId invalide." });
    }

    // Vérifier que le partnerId correspond à un utilisateur partenaire réel
    const partner = await User.findById(partnerId).select("role isActive email firstName lastName");
    if (!partner || !["partenaire", "admin"].includes(partner.role)) {
      return res.status(404).json({ message: "Partenaire introuvable ou rôle invalide." });
    }
    if (!partner.isActive) {
      return res.status(403).json({ message: "Ce compte partenaire est inactif." });
    }

    // businessId optionnel — s'il est fourni, doit appartenir à ce partenaire
    // (IDOR sinon). S'il est omis, la facture couvre uniquement les
    // véhicules/chauffeurs SANS entité assignée (voir vehicleFilter plus bas) —
    // pas "tous les véhicules du partenaire" comme avant l'introduction du
    // multi-entité, sinon une transaction rattachée à une entité serait
    // facturée deux fois (une fois ici, une fois via sa propre entité).
    if (businessId) {
      const business = await PartnerBusiness.findOne({ _id: businessId, owner: partnerId }).select("_id").lean();
      if (!business) return res.status(400).json({ message: "Entreprise introuvable pour ce partenaire." });
    }

    // Vérifier si une facture existe déjà pour ce partenaire, cette entité et cette période
    const existing = await Invoice.findOne({ partner: partnerId, businessId: businessId || null, month, year });
    if (existing) {
      return res.status(409).json({ message: "Une facture existe déjà pour ce partenaire (et cette entité) sur cette période.", invoice: existing });
    }

    // Récupérer les véhicules et chauffeurs du partenaire, scopés à l'entité
    const vehicleFilter = { owner: partnerId, business: businessId || null };
    const driverFilter  = { owner: partnerId, business: businessId || null };
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find(vehicleFilter).select("_id"),
      Driver.find(driverFilter).select("_id"),
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
      devise:             b.devise || "USD",
      completedAt:        b.paidAt,
    }));

    const totalCommission = lines.reduce((s, l) => s + l.commissionAmount, 0);

    const reference = await generateInvoiceReference(year);
    const dueDate   = new Date(year, month, 15);  // 15 du mois suivant

    const invoice = await Invoice.create({
      reference,
      partner: partnerId,
      businessId: businessId || null,
      month,
      year,
      lines,
      totalCommission,
      devise: "USD",
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
    if (isDuplicateInvoiceError(err)) {
      return res.status(409).json({ message: "Une facture existe déjà pour ce partenaire (et cette entité) sur cette période." });
    }
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
      .populate("vehicle", "owner business")
      .populate("driver",  "owner business");

    // Grouper par (partenaire, entité) — un partenaire multi-entités reçoit
    // une facture PAR ENTITÉ (voir Invoice.businessId), pas une seule facture
    // mélangeant toutes ses entités. "none" regroupe les véhicules/chauffeurs
    // sans entité assignée, exactement comme l'ancien comportement global
    // pour un partenaire n'utilisant pas le multi-entité.
    const byGroup = new Map();
    for (const b of bookings) {
      const source = b.vehicle || b.driver;
      const ownerId = source?.owner?.toString();
      if (!ownerId) continue;
      const businessId = source?.business?.toString() || null;
      const key = groupKey(ownerId, businessId);
      if (!byGroup.has(key)) byGroup.set(key, { partnerId: ownerId, businessId, bookings: [] });
      byGroup.get(key).bookings.push(b);
    }

    const results = [];
    for (const { partnerId, businessId, bookings: pBookings } of byGroup.values()) {
      const existing = await Invoice.findOne({ partner: partnerId, businessId, month, year });
      if (existing) { results.push({ partnerId, businessId, status: "already_exists", reference: existing.reference }); continue; }

      const lines = pBookings.map((b) => ({
        booking:            b._id,
        bookingRef:         b.reference || b._id.toString(),
        serviceType:        b.type,
        montantTransaction: b.transaction?.finalAmount || b.montantTotal || 0,
        commissionRate:     b.commissionRate || 0,
        commissionAmount:   b.commissionAmount || 0,
        devise:             b.devise || "USD",
        completedAt:        b.paidAt,
      }));

      const totalCommission = lines.reduce((s, l) => s + l.commissionAmount, 0);
      const reference       = await generateInvoiceReference(year);
      const dueDate         = new Date(year, month, 15);

      // Isolé dans son propre try/catch : une erreur sur UN groupe (partenaire,
      // entité) — notamment un doublon E11000 en cas de course avec une autre
      // requête concurrente — ne doit jamais interrompre la génération des
      // factures des autres groupes déjà en file.
      let invoice;
      try {
        invoice = await Invoice.create({
          reference,
          partner: partnerId,
          businessId,
          month,
          year,
          lines,
          totalCommission,
          devise: "USD",
          status: "pending",
          dueDate,
        });
      } catch (err) {
        if (isDuplicateInvoiceError(err)) {
          results.push({ partnerId, businessId, status: "already_exists" });
          continue;
        }
        logger.error("generateAllMonthlyInvoices (groupe):", err);
        results.push({ partnerId, businessId, status: "error", message: err.message });
        continue;
      }

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

      results.push({ partnerId, businessId, status: "created", reference, totalCommission, lines: lines.length });
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
    const filter = { partner: req.user._id };
    if (req.query.businessId && mongoose.Types.ObjectId.isValid(req.query.businessId)) {
      filter.businessId = req.query.businessId;
    }
    const invoices = await Invoice.find(filter)
      .sort({ year: -1, month: -1 })
      .populate("businessId", "companyName")
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
    const { status, year, month, businessId, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (year)   filter.year   = Number(year);
    if (month)  filter.month  = Number(month);
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) filter.businessId = businessId;

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ year: -1, month: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate("partner", "firstName lastName email phone")
        .populate("businessId", "companyName"),
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
