import logger from "../utils/logger.js";
import Booking from "../models/Booking.js";
import IETransaction from "../models/IETransaction.js";
import User from "../models/User.js";

// ── GET /api/analytics/admin ────────────────────────────────────────────────
// Vue "Analytics Avancé" de l'admin — construite entièrement à partir des
// données déjà collectées (Booking/IETransaction/User), aucune nouvelle
// collecte requise. Fenêtre glissante de 12 mois pour les tendances.
export const getAnalytics = async (req, res) => {
  try {
    const now   = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - 11, 1); // 12 mois glissants

    const [monthlyBookings, byCurrency, byType, byCountry, monthlyUsers, ieByStatus, ieMonthly] = await Promise.all([
      // Tendance mensuelle réservations : volume + CA + commission
      Booking.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id:        { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
          count:      { $sum: 1 },
          revenue:    { $sum: "$montantTotal" },
          commission: { $sum: "$commissionAmount" },
        } },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),
      // Répartition par devise (commandes terminées uniquement — CA réel)
      Booking.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: "$devise", total: { $sum: "$montantTotal" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      // Répartition par type de service
      Booking.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: "$type", total: { $sum: "$montantTotal" }, commission: { $sum: "$commissionAmount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      // Répartition par pays du CLIENT (d'où viennent nos utilisateurs actifs)
      Booking.aggregate([
        { $match: { status: "completed", client: { $ne: null } } },
        { $lookup: { from: "users", localField: "client", foreignField: "_id", as: "clientUser" } },
        { $unwind: "$clientUser" },
        { $group: { _id: { $ifNull: ["$clientUser.country", "—"] }, total: { $sum: "$montantTotal" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 15 },
      ]),
      // Croissance utilisateurs (nouveaux comptes / mois)
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id:   { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
          count: { $sum: 1 },
        } },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),
      // Import/Export — répartition par statut (volume actuel du pipeline)
      IETransaction.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$finalOffer.totalAmount" } } },
      ]),
      // Import/Export — tendance mensuelle des transactions créées
      IETransaction.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id:   { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
          count: { $sum: 1 },
        } },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),
    ]);

    const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
    const fmtMonthly = (rows) => rows.map((r) => ({ month: monthKey(r._id.y, r._id.m), ...r, _id: undefined }));

    res.json({
      period: { since, until: now },
      monthlyBookings: fmtMonthly(monthlyBookings),
      monthlyUsers:    fmtMonthly(monthlyUsers),
      ieMonthly:       fmtMonthly(ieMonthly),
      byCurrency:      byCurrency.map((r) => ({ currency: r._id || "—", total: r.total, count: r.count })),
      byType:          byType.map((r) => ({ type: r._id || "—", total: r.total, commission: r.commission, count: r.count })),
      byCountry:       byCountry.map((r) => ({ country: r._id || "—", total: r.total, count: r.count })),
      ieByStatus:      ieByStatus.map((r) => ({ status: r._id, count: r.count, total: r.total || 0 })),
    });
  } catch (err) {
    logger.error("getAnalytics:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
