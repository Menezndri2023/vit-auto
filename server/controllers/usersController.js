import logger from "../utils/logger.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Notification from "../models/Notification.js";
import { sendEmail, identityRejectedTemplate } from "../config/email.js";
import { logAction } from "../middleware/auditLog.js";
import { validateImageDataUri } from "../utils/imageValidation.js";
import { isValidCountryCode } from "../utils/countries.js";
import PartnerVerification from "../models/PartnerVerification.js";
import PartnerCertification from "../models/PartnerCertification.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import ImporterPartnerProfile from "../models/ImporterPartnerProfile.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import Review from "../models/Review.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    // Exclut les photos KYC en base64 (identity/driverLicenseOcr) de la LISTE — ces champs
    // peuvent peser plusieurs Mo par utilisateur et ne servent qu'à la vue détail d'un
    // utilisateur précis (getUser), jamais à un listing de jusqu'à 200 lignes.
    // Exclusion explicite des champs sensibles ici : le transform toJSON du schéma
    // User (voir models/User.js) ne s'applique qu'aux documents Mongoose, pas aux
    // objets bruts retournés par .lean() — confirmé en simulation (refreshTokens
    // fuitait sur cette route précise malgré le transform).
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -identity.frontImage -identity.backImage -identity.selfie -driverLicenseOcr.frontImage -driverLicenseOcr.backImage -refreshTokens -twoFactor.secret -twoFactor.backupCodes -phoneOtp -passwordResetToken -emailVerificationToken")
        .sort({ createdAt: -1 })
        .skip((Math.max(Number(page), 1) - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getUsers:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Profil partenaire public (aucune authentification requise) ────────────
// Champ whitelist strict : jamais l'email, le téléphone n'est volontairement affiché
// que côté frontend s'il existe (contact commercial), jamais de données KYC brutes.
export const getPublicProfile = async (req, res) => {
  try {
    // Sélection au niveau champ ET sous-champ : `business`/`defaultLocation` sont
    // des sous-documents complets (rccm, taxId, logo, adresse, lat/lng précis) —
    // les inclure entiers exposait ces données à tout visiteur anonyme sans
    // qu'aucun usage frontend ne les consomme. Fuite PII trouvée en audit (2026-07).
    const user = await User.findById(req.params.id)
      .select("firstName lastName phone profilePhoto business.companyName partnerType defaultLocation.city isFounder certificationBadge role isActive")
      .lean();
    if (!user || !user.isActive || !["partenaire", "admin"].includes(user.role)) {
      return res.status(404).json({ message: "Partenaire introuvable." });
    }

    // Note globale du partenaire — agrégée sur TOUTES ses annonces (véhicules
    // ET chauffeurs), pas seulement une annonce précise. Review.noteMoyenne
    // n'existe qu'au niveau d'un véhicule/chauffeur individuel (voir Review.js
    // recalcTargetStats) ; aucune moyenne au niveau partenaire n'existait avant.
    const [vehicleIds, driverIds] = await Promise.all([
      Vehicle.find({ owner: user._id }).select("_id").lean(),
      Driver.find({ owner: user._id }).select("_id").lean(),
    ]);
    const targets = [
      ...vehicleIds.map((v) => ({ targetType: "vehicle", targetId: v._id })),
      ...driverIds.map((d) => ({ targetType: "driver", targetId: d._id })),
    ];
    let rating = { average: 0, count: 0 };
    if (targets.length) {
      const agg = await Review.aggregate([
        { $match: { visible: true, $or: targets } },
        { $group: { _id: null, avg: { $avg: "$note" }, count: { $sum: 1 } } },
      ]);
      if (agg.length) rating = { average: Math.round(agg[0].avg * 10) / 10, count: agg[0].count };
    }

    const { isActive: _isActive, role: _role, ...publicFields } = user;
    res.json({ ...publicFields, rating });
  } catch (err) {
    logger.error("getPublicProfile:", err);
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
    logger.error("getUser:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Vue de confiance unifiée (admin) — ajoutée 2026-07-16 ─────────────────
// VIT AUTO a accumulé 6 systèmes de confiance/vérification distincts au fil
// des sessions (sellerType, certificationBadge/PartnerCertification,
// PartnerVerification, Founding Partner/PartnerOnboarding, ImporterPartnerProfile,
// PartnerShowroom.trustScore), sans jamais les fusionner ni les relier
// clairement — un admin devait ouvrir 5 onglets différents pour comprendre le
// niveau de confiance réel d'un partenaire. Cet endpoint ne fusionne AUCUNE
// donnée (risque jugé disproportionné) : il se contente d'agréger en lecture
// seule ce qui existe déjà, pour un seul affichage consolidé côté admin.
export const getUserTrustOverview = async (req, res) => {
  try {
    const userId = req.params.id;
    const [user, verification, certification, onboarding, importerProfile, showroom] = await Promise.all([
      User.findById(userId).select("sellerType certificationBadge kycStatus kycBadge isFounder role").lean(),
      PartnerVerification.findOne({ userId }).select("status trustScore trustLevel").lean(),
      PartnerCertification.findOne({ userId }).select("overallStatus certificationBadge").lean(),
      PartnerOnboarding.findOne({ userId }).select("isFoundingPartner legalEntityType status commissions.lockedAt").lean(),
      ImporterPartnerProfile.findOne({ userId }).select("status badgeLevel").lean(),
      PartnerShowroom.findOne({ partnerId: userId }).select("trustScore.overall isPublished").lean(),
    ]);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    res.json({
      overview: {
        sellerType:          user.sellerType || null,
        kyc:                 { status: user.kycStatus || null, badge: user.kycBadge || null },
        certificationBadge:  user.certificationBadge || null, // badge synchronisé sur User (source: PartnerCertification)
        partnerVerification: verification ? { status: verification.status, trustScore: verification.trustScore, trustLevel: verification.trustLevel } : null,
        partnerCertification: certification ? { status: certification.overallStatus, badge: certification.certificationBadge } : null,
        foundingPartner:     onboarding ? { isFoundingPartner: onboarding.isFoundingPartner, legalEntityType: onboarding.legalEntityType, status: onboarding.status, lockedAt: onboarding.commissions?.lockedAt } : null,
        importerProfile:     importerProfile ? { status: importerProfile.status, badgeLevel: importerProfile.badgeLevel } : null,
        showroom:            showroom ? { trustScore: showroom.trustScore?.overall ?? null, isPublished: showroom.isPublished } : null,
      },
    });
  } catch (err) {
    logger.error("getUserTrustOverview:", err);
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
    const previousRole = await User.findById(req.params.id).select("role").lean();
    // Créer un admin (ou démettre un admin existant) équivaut à distribuer des
    // permissions complètes (voir updateAdminScope — adminScope=[] = accès
    // total) : réservé à un super admin, sinon cette route contournait
    // entièrement la protection déjà en place sur /admin/:id/scope.
    const actingScopes = req.user.adminScope || [];
    const isSuperAdmin = actingScopes.length === 0 || actingScopes.includes("super_admin");
    if ((role === "admin" || previousRole?.role === "admin") && !isSuperAdmin) {
      return res.status(403).json({ message: "Seul un super admin peut créer ou modifier un compte admin." });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    // Journal d'audit global (changement de rôle — action sensible)
    await logAction(req, "user.role_change", "User", req.params.id, {
      before: { role: previousRole?.role ?? null },
      after:  { role },
    });
    res.json({ user });
  } catch (err) {
    logger.error("updateUserRole:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Rôles & Permissions — comptes admin et leurs permissions fines ────────
// (voir middleware/auth.js requireAdminScope). adminScope=[] = accès complet
// (comportement historique, avant l'ajout de ce champ) — n'affiche donc pas
// "aucune permission" pour un admin non encore scopé, mais "Accès complet".
export const getAdminAccounts = async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" })
      .select("firstName lastName email adminScope isActive createdAt lastLogin")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ admins });
  } catch (err) {
    logger.error("getAdminAccounts:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/users/admin/:id/scope ──────────────────────────────────────
export const updateAdminScope = async (req, res) => {
  try {
    const VALID_SCOPES = ["super_admin", "finance", "kyc", "import_export", "support", "moderation"];
    const { scope } = req.body;
    if (!Array.isArray(scope) || scope.some((s) => !VALID_SCOPES.includes(s))) {
      return res.status(400).json({ message: "Permissions invalides." });
    }
    // Inclut email/phone même si non modifiés ici : le hook pre("validate") du
    // modèle ("au moins un email ou téléphone") s'exécute sur target.save() plus
    // bas et rejetait systématiquement cette sauvegarde quand ces champs
    // n'étaient pas chargés (undefined sur le document ≠ absent en base) — bug
    // réel qui cassait cette route à 100% avant ce correctif.
    const target = await User.findById(req.params.id).select("role adminScope email phone");
    if (!target) return res.status(404).json({ message: "Utilisateur introuvable." });
    if (target.role !== "admin") return res.status(400).json({ message: "Ce compte n'est pas un compte admin." });

    // Seul un super admin (ou un compte non encore scopé, accès complet
    // historique) peut modifier les permissions d'un autre admin — sinon un
    // admin "finance" pourrait s'auto-attribuer "super_admin".
    const actingScopes = req.user.adminScope || [];
    if (actingScopes.length > 0 && !actingScopes.includes("super_admin")) {
      return res.status(403).json({ message: "Seul un super admin peut modifier les permissions." });
    }

    const before = target.adminScope;
    target.adminScope = scope;
    await target.save();

    await logAction(req, "user.admin_scope_change", "User", req.params.id, { before, after: scope });

    res.json({ success: true, adminScope: target.adminScope });
  } catch (err) {
    logger.error("updateAdminScope:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Désactiver / réactiver un compte (admin) ──────────────────────────────
export const toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    // Même protection que deleteUser ci-dessous : sans elle, un admin à accès
    // restreint (ex: scope "moderation") pouvait désactiver le compte d'un
    // super admin, neutralisant sa propre chaîne de contrôle.
    if (user.role === "admin") {
      const actingScopes = req.user.adminScope || [];
      const isSuperAdmin = actingScopes.length === 0 || actingScopes.includes("super_admin");
      if (!isSuperAdmin) {
        return res.status(403).json({ message: "Seul un super admin peut activer/désactiver un compte admin." });
      }
    }
    const wasActive = user.isActive;
    user.isActive = !user.isActive;
    await user.save();
    // Journal d'audit global (activation/désactivation de compte — action sensible)
    await logAction(req, user.isActive ? "user.activate" : "user.deactivate", "User", req.params.id, {
      before: { isActive: wasActive },
      after:  { isActive: user.isActive },
    });
    res.json({ user: { id: user._id, isActive: user.isActive } });
  } catch (err) {
    logger.error("toggleUserActive:", err);
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
    // Journal d'audit global (suppression de compte — action sensible et irréversible)
    await logAction(req, "user.delete", "User", req.params.id, {
      before: { email: user.email, role: user.role },
    });
    res.json({ message: "Utilisateur supprimé." });
  } catch (err) {
    logger.error("deleteUser:", err);
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
    logger.error("getAdminStats:", err);
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

    for (const [label, img] of [["recto", frontImage], ["verso", backImage], ["selfie", selfie]]) {
      const check = validateImageDataUri(img, 6 * 1024 * 1024);
      if (!check.ok) return res.status(400).json({ message: `Photo (${label}) : ${check.message}` });
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
    logger.error("submitIdentity:", err);
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

    const previousStatus = user.identity.status;
    user.identity.status = status;
    if (status === "verified") {
      user.identity.verifiedAt  = new Date();
      user.documentsVerified    = true;
    } else {
      user.identity.rejectionReason = rejectionReason || null;
      user.documentsVerified        = false;
    }
    await user.save();

    // Journal d'audit global (décision de vérification d'identité — action sensible)
    await logAction(req, `identity.${status}`, "User", req.params.id, {
      before: { identityStatus: previousStatus },
      after:  { identityStatus: status, rejectionReason: status === "rejected" ? (rejectionReason || null) : null },
    });

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

    if (status === "rejected") {
      sendEmail({
        to:       user.email,
        subject:  "VIT AUTO — Vérification d'identité refusée",
        html:     identityRejectedTemplate(user.firstName, rejectionReason),
        template: "identity_rejected",
        userId:   user._id,
      }).catch((e) => logger.error("sendEmail identityRejected:", { error: e.message }));
    }

    res.json({ message: `Identité ${status === "verified" ? "vérifiée" : "refusée"}.`, user: { id: user._id, identityStatus: user.identity.status } });
  } catch (err) {
    logger.error("adminVerifyIdentity:", err);
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
    logger.error("getPendingIdentities:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mettre à jour son propre profil (utilisateur connecté) ───────────────
export const updateMyProfile = async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "address", "country",
                     "notif_emailReminders", "notif_smsReminders",
                     "notif_promotionalEmails", "notif_bookingConfirmations",
                     "licenseNumber", "licenseExpiry", "profilePhoto"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.country) {
      updates.country = String(updates.country).toUpperCase();
      if (!(await isValidCountryCode(updates.country))) {
        return res.status(400).json({ message: "Pays invalide." });
      }
    }

    if (updates.profilePhoto) {
      const check = validateImageDataUri(updates.profilePhoto, 4 * 1024 * 1024);
      if (!check.ok) return res.status(400).json({ message: check.message });
    }

    // Changer de numéro ici doit repasser par une vérification OTP (send/verify-phone-otp) :
    // sans ce reset, le nouveau numéro héritait du statut "vérifié" de l'ancien,
    // permettant de renseigner n'importe quel numéro tout en gardant phoneVerified=true
    // et donc de contourner le blocage login/KYC sur téléphone non vérifié.
    if (updates.phone !== undefined && updates.phone !== req.user.phone) {
      updates.phoneVerified = false;
    }
    // Un compte inscrit par téléphone (pas d'email) ne doit pas pouvoir se retrouver
    // sans aucun moyen de connexion en vidant son seul numéro (findByIdAndUpdate ne
    // déclenche pas le hook pre("validate") du schéma — vérifié explicitement ici).
    if (!req.user.email && (updates.phone === "" || updates.phone === null)) {
      return res.status(400).json({ message: "Vous devez conserver un email ou un numéro de téléphone sur votre compte." });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password -emailVerificationToken");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    res.json({ user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Ce numéro de téléphone est déjà utilisé par un autre compte." });
    }
    logger.error("updateMyProfile:", err);
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
    logger.error("getMyProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
