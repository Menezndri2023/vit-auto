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

// ── Tableau de bord statistiques admin ────────────────────────────────────
export const getAdminStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalPartenaires,
      totalVehicles,
      pendingVehicles,
      totalDrivers,
      totalBookings,
      pendingBookings,
      completedBookings,
    ] = await Promise.all([
      User.countDocuments({ role: "client" }),
      User.countDocuments({ role: "partenaire" }),
      Vehicle.countDocuments({ status: "approved" }),
      Vehicle.countDocuments({ status: "pending" }),
      Driver.countDocuments({ status: "approved" }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: "pending" }),
      Booking.countDocuments({ status: "completed" }),
    ]);

    // Revenus totaux
    const revenueAgg = await Booking.aggregate([
      { $match: { isPaid: true } },
      { $group: { _id: null, total: { $sum: "$montantTotal" } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    res.json({
      users: { total: totalUsers, partenaires: totalPartenaires },
      vehicles: { total: totalVehicles, pending: pendingVehicles },
      drivers: { total: totalDrivers },
      bookings: { total: totalBookings, pending: pendingBookings, completed: completedBookings },
      revenue: { total: totalRevenue, devise: "XOF" },
    });
  } catch (err) {
    console.error("getAdminStats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
