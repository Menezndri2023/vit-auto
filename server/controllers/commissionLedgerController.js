import mongoose from "mongoose";
import logger from "../utils/logger.js";
import CommissionLedger from "../models/CommissionLedger.js";

// ── GET /api/commission-ledger/mine — partenaire connecté ────────────────────
// Bug réel corrigé (audit) : un partenaire n'avait aucun moyen de savoir ce
// qui lui était réellement dû vs déjà versé — getPartnerStats se contentait
// de sommer partnerPayout sur les commandes "completed", sans jamais
// distinguer un virement réellement exécuté d'un montant encore en attente.
export const getMyPayouts = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = { partnerId: req.user._id };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [entries, total, sums] = await Promise.all([
      CommissionLedger.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(Number(limit), 100))
        .lean(),
      CommissionLedger.countDocuments(filter),
      CommissionLedger.aggregate([
        { $match: { partnerId: req.user._id } },
        { $group: { _id: "$status", total: { $sum: "$commissionAmount" } } },
      ]),
    ]);

    const totals = { pending: 0, confirmed: 0, paid: 0, disputed: 0, cancelled: 0 };
    for (const s of sums) if (s._id in totals) totals[s._id] = s.total;

    res.json({ entries, total, page: Number(page), limit: Number(limit), totals });
  } catch (err) {
    logger.error("getMyPayouts:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/commission-ledger/admin — liste admin ────────────────────────────
export const adminListPayouts = async (req, res) => {
  try {
    const { status, partnerId, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    // Un id invalide déclenchait un CastError non intercepté (500 opaque au
    // lieu d'un filtre simplement ignoré/rejeté) — même garde que les autres
    // paramètres businessId de cette session (voir pmsController.safeBusinessFilter).
    if (partnerId) {
      if (!mongoose.Types.ObjectId.isValid(partnerId)) {
        return res.status(400).json({ message: "partnerId invalide." });
      }
      filter.partnerId = partnerId;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [entries, total] = await Promise.all([
      CommissionLedger.find(filter)
        .populate("partnerId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(Number(limit), 200))
        .lean(),
      CommissionLedger.countDocuments(filter),
    ]);

    res.json({ entries, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    logger.error("adminListPayouts:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/commission-ledger/admin/:id/mark-paid ──────────────────────────
// Ne déclenche AUCUN virement réel (aucune intégration bancaire n'existe côté
// serveur, voir commissionLedger.js) — enregistre seulement qu'un virement a
// été exécuté manuellement en dehors de la plateforme (banque/mobile money),
// même logique que le reste des flux financiers de ce projet (remboursements
// signalés via refund_needed, jamais exécutés automatiquement).
export const adminMarkPaid = async (req, res) => {
  try {
    const { paidViaTxId, notes } = req.body;
    const entry = await CommissionLedger.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Entrée introuvable." });
    if (entry.status === "paid") {
      return res.status(400).json({ message: "Déjà marqué comme payé." });
    }

    entry.status       = "paid";
    entry.paidAt        = new Date();
    entry.paidViaTxId    = paidViaTxId || null;
    if (notes) entry.notes = notes;
    await entry.save();

    res.json({ entry, message: "Reversement marqué comme payé." });
  } catch (err) {
    logger.error("adminMarkPaid:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
