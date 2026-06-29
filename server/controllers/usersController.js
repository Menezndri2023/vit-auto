import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Notification from "../models/Notification.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
import { transporter, FROM_ADDRESS, identityRejectedTemplate } from "../config/email.js";

// ── Liste de tous les utilisateurs (admin) ────────────────────────────────
export const getUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 20, search } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      const s = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { firstName: new RegExp(s, "i") },
        { lastName:  new RegExp(s, "i") },
        { email:     new RegExp(s, "i") },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((Math.max(Number(page), 1) - 1) * safeLimit)
        .limit(safeLimit),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, pages: Math.ceil(total / safeLimit) });
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

// ── Soumettre sa pièce d'identité (utilisateur connecté) ─────────────────
export const submitIdentity = async (req, res) => {
  try {
    const { type, number, expiryDate, frontImage, backImage, selfie } = req.body;

    if (!type || !number) {
      return res.status(400).json({ message: "Type et numéro de pièce requis." });
    }
    const allowed = ["cni", "passport", "permis", "carte_sejour"];
    if (!allowed.includes(type)) {
      return res.status(400).json({ message: "Type de pièce invalide." });
    }
    // Validation basique du numéro (non vide, longueur raisonnable)
    if (number.trim().length < 4) {
      return res.status(400).json({ message: "Numéro de pièce trop court." });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    user.identity = {
      type,
      number:      number.trim(),
      expiryDate:  expiryDate ? new Date(expiryDate) : null,
      frontImage:  frontImage || null,
      backImage:   backImage  || null,
      selfie:      selfie     || null,
      status:      "pending",
      submittedAt: new Date(),
    };
    await user.save();

    // Notifier l'admin
    const admins = await User.find({ role: "admin", isActive: true }).select("_id");
    const notifs = admins.map((a) => ({
      user:    a._id,
      type:    "system",
      titre:   "📋 Nouvelle pièce d'identité soumise",
      message: `${user.firstName} ${user.lastName} a soumis sa pièce d'identité.`,
      lien:    "/admin",
    }));
    if (notifs.length) await Notification.insertMany(notifs);

    res.json({ message: "Pièce d'identité soumise. En attente de vérification.", status: "pending" });
  } catch (err) {
    console.error("submitIdentity:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Vérifier / rejeter une identité (admin) ───────────────────────────────
export const adminVerifyIdentity = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide (verified | rejected)." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    if (!user.identity?.number) {
      return res.status(400).json({ message: "Aucune pièce soumise pour cet utilisateur." });
    }

    user.identity.status = status;
    if (status === "verified") {
      user.identity.verifiedAt  = new Date();
      user.documentsVerified    = true;
    } else {
      user.identity.rejectionReason = rejectionReason || null;
      user.documentsVerified        = false;
    }
    await user.save();

    // Notifier l'utilisateur
    await Notification.create({
      user:    user._id,
      type:    status === "verified" ? "listing_approved" : "listing_rejected",
      titre:   status === "verified" ? "✅ Identité vérifiée" : "❌ Identité refusée",
      message: status === "verified"
        ? "Votre pièce d'identité a été vérifiée avec succès."
        : `Votre pièce a été refusée. ${rejectionReason || ""}`,
      lien: "/profile",
    });

    // E-mail si rejet
    if (status === "rejected") {
      transporter.sendMail({
        from:    FROM_ADDRESS,
        to:      user.email,
        subject: "❌ VIT AUTO — Vérification d'identité refusée",
        html:    identityRejectedTemplate(user.firstName, rejectionReason),
      }).catch((e) => console.error("Email rejet (non-bloquant):", e.message));
    }

    res.json({ message: `Identité ${status === "verified" ? "vérifiée" : "refusée"}.`, user: { id: user._id, identityStatus: user.identity.status } });
  } catch (err) {
    console.error("adminVerifyIdentity:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Liste des identités en attente (admin) ────────────────────────────────
export const getPendingIdentities = async (req, res) => {
  try {
    const users = await User.find({ "identity.status": "pending" })
      .select("-password")
      .sort({ "identity.submittedAt": 1 });
    res.json({ users });
  } catch (err) {
    console.error("getPendingIdentities:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mettre à jour son propre profil (utilisateur connecté) ───────────────
export const updateMyProfile = async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "address",
                     "notif_emailReminders", "notif_smsReminders",
                     "notif_promotionalEmails", "notif_bookingConfirmations",
                     "licenseNumber", "licenseExpiry", "profilePhoto"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select("-password -emailVerificationToken");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    res.json({ user });
  } catch (err) {
    console.error("updateMyProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Profil complet de l'utilisateur connecté ──────────────────────────────
export const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -emailVerificationToken");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    res.json({ user });
  } catch (err) {
    console.error("getMyProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
