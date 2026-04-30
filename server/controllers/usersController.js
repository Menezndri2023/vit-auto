import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";

// ── Liste de tous les utilisateurs (admin) ────────────────────────────────
export const getUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, "i") },
        { lastName:  new RegExp(search, "i") },
        { email:     new RegExp(search, "i") },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("getUsers:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Détail d'un utilisateur (admin) ───────────────────────────────────────
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    res.json({ user });
  } catch (err) {
    console.error("getUser:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mettre à jour le rôle d'un utilisateur (admin) ───────────────────────
export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["client", "partenaire", "admin"].includes(role)) {
      return res.status(400).json({ message: "Rôle invalide." });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    res.json({ user });
  } catch (err) {
    console.error("updateUserRole:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Désactiver / réactiver un compte (admin) ──────────────────────────────
export const toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ user: { id: user._id, isActive: user.isActive } });
  } catch (err) {
    console.error("toggleUserActive:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Supprimer un utilisateur (admin) ──────────────────────────────────────
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    if (user.role === "admin") return res.status(403).json({ message: "Impossible de supprimer un admin." });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Utilisateur supprimé." });
  } catch (err) {
    console.error("deleteUser:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Tableau de bord statistiques admin (enrichi) ──────────────────────────
export const getAdminStats = async (req, res) => {
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1); // 1er du mois courant

    const [
      totalClients,
      totalPartenaires,
      totalAdmins,
      blockedUsers,
      approvedVehicles,
      pendingVehicles,
      rejectedVehicles,
      totalDrivers,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
      newUsersThisMonth,
      newBookingsThisMonth,
    ] = await Promise.all([
      User.countDocuments({ role: "client" }),
      User.countDocuments({ role: "partenaire" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ isActive: false }),
      Vehicle.countDocuments({ status: "approved" }),
      Vehicle.countDocuments({ status: "pending" }),
      Vehicle.countDocuments({ status: "rejected" }),
      Driver.countDocuments({ status: "approved" }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: "pending" }),
      Booking.countDocuments({ status: { $in: ["confirmed", "preparing", "ready", "in_progress"] } }),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments({ status: "cancelled" }),
      User.countDocuments({ createdAt: { $gte: start } }),
      Booking.countDocuments({ createdAt: { $gte: start } }),
    ]);

    // Revenus totaux + ce mois
    const [revenueAgg, revenueMonthAgg] = await Promise.all([
      Booking.aggregate([
        { $match: { isPaid: true } },
        { $group: { _id: null, total: { $sum: "$montantTotal" } } },
      ]),
      Booking.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: start } } },
        { $group: { _id: null, total: { $sum: "$montantTotal" } } },
      ]),
    ]);

    // Répartition par type de booking
    const bookingsByType = await Booking.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);

    // 6 derniers mois de revenus
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const revenueByMonth = await Booking.aggregate([
      { $match: { isPaid: true, createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        total: { $sum: "$montantTotal" },
        count: { $sum: 1 },
      }},
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.json({
      users: {
        total: totalClients + totalPartenaires + totalAdmins,
        clients: totalClients,
        partenaires: totalPartenaires,
        admins: totalAdmins,
        blocked: blockedUsers,
        newThisMonth: newUsersThisMonth,
      },
      vehicles: {
        approved: approvedVehicles,
        pending: pendingVehicles,
        rejected: rejectedVehicles,
        total: approvedVehicles + pendingVehicles + rejectedVehicles,
      },
      drivers: { total: totalDrivers },
      bookings: {
        total: totalBookings,
        pending: pendingBookings,
        confirmed: confirmedBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
        newThisMonth: newBookingsThisMonth,
        byType: bookingsByType,
      },
      revenue: {
        total: revenueAgg[0]?.total || 0,
        thisMonth: revenueMonthAgg[0]?.total || 0,
        byMonth: revenueByMonth,
        devise: "XOF",
      },
    });
  } catch (err) {
    console.error("getAdminStats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
