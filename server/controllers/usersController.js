import bcrypt from "bcryptjs";
import crypto from "crypto";
import logger from "../utils/logger.js";
import { dispatch } from "../queue/index.js";
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
import PartnerBusiness from "../models/PartnerBusiness.js";
import ImporterPartnerProfile from "../models/ImporterPartnerProfile.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import Review from "../models/Review.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Liste de tous les utilisateurs (admin) ────────────────────────────────
export const getUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 20, search } = req.query;
    // Plafond relevé (bug réel trouvé en audit) : AdminPanel.jsx charge tout
    // l'onglet Comptes en un seul appel puis "pagine" côté client sur ces
    // résultats déjà tronqués — au-delà de 200 comptes, les plus anciens
    // devenaient invisibles sans aucun indice de troncature. Voir
    // loadMoreUsers (AdminPanel.jsx) pour le "Charger plus" côté front.
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 1000);
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
    const [user, verification, certification, onboarding, importerProfile, showroom, businesses, onboardings, drivers] = await Promise.all([
      User.findById(userId).select("sellerType certificationBadge kycStatus kycBadge isFounder role identity.frontImage identity.selfie").lean(),
      PartnerVerification.findOne({ userId }).select("status trustScore trustLevel").lean(),
      PartnerCertification.findOne({ userId }).select("overallStatus certificationBadge").lean(),
      PartnerOnboarding.findOne({ userId }).select("isFoundingPartner legalEntityType status commissions.lockedAt").lean(),
      ImporterPartnerProfile.findOne({ userId }).select("status badgeLevel").lean(),
      PartnerShowroom.findOne({ partnerId: userId }).select("trustScore.overall isPublished").lean(),
      // ── Ajouts : détail par entité + présence de documents (drill-through) ──
      // Le Founding Partner Program est désormais PAR ENTITÉ (voir
      // PartnerOnboarding.businessId) : un même utilisateur peut avoir plusieurs
      // entités, chacune avec son propre dossier. `foundingPartner` ci-dessus
      // reste tel quel (rétrocompatibilité) ; `entities` donne le détail complet.
      PartnerBusiness.find({ owner: userId }).select("companyName country ville isDefault").sort({ createdAt: 1 }).lean(),
      PartnerOnboarding.find({ userId }).populate("businessId", "companyName country ville").select("businessId status referenceNumber isFoundingPartner").lean(),
      Driver.find({ owner: userId }).select("firstName lastName status cv").lean(),
    ]);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    const entities = businesses.map((b) => ({
      business: { id: b._id, companyName: b.companyName, country: b.country, ville: b.ville, isDefault: b.isDefault },
      onboarding: onboardings.find((o) => String(o.businessId?._id) === String(b._id)) || null,
    }));
    // Dossiers orphelins (businessId non résolu par le populate — ne devrait
    // plus arriver après migration, gardé par prudence pour ne jamais en
    // perdre un silencieusement dans la vue admin).
    for (const o of onboardings) {
      if (!o.businessId) entities.push({ business: null, onboarding: o });
    }

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
        entities,
        documents: {
          identityFront:   !!user.identity?.frontImage,
          kycSelfie:       !!user.identity?.selfie,
          driverProfiles:  drivers.map((d) => ({ id: d._id, name: `${d.firstName} ${d.lastName}`.trim(), status: d.status, hasCv: !!d.cv })),
        },
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

// ── PATCH /api/users/:id/phone — un admin corrige/renseigne le numéro d'un
// compte (bug réel trouvé en audit : aucun formulaire n'exposait ce champ en
// écriture côté admin — le numéro n'était éditable que par l'utilisateur
// lui-même via /me, voir updateMyProfile — un partenaire inscrit par email
// sans jamais renseigner de téléphone, ou avec un numéro faux/périmé,
// n'avait aucun moyen d'être corrigé par le support). Même garde-fous que
// updateMyProfile : phoneVerified retombe à false si la valeur change (un
// numéro modifié par un tiers ne doit jamais hériter du statut "vérifié" d'un
// ancien OTP), et un doublon (index unique sparse) répond 409, pas 500.
export const adminUpdatePhone = async (req, res) => {
  try {
    const { phone } = req.body;
    const target = await User.findById(req.params.id).select("phone email");
    if (!target) return res.status(404).json({ message: "Utilisateur introuvable." });

    const next = phone == null ? null : String(phone).trim();
    if (!next && !target.email) {
      return res.status(400).json({ message: "Ce compte n'a pas d'email — impossible de retirer son seul moyen de connexion." });
    }

    const changed = (target.phone || null) !== (next || null);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { phone: next || null, ...(changed ? { phoneVerified: false } : {}) } },
      { new: true, runValidators: true }
    ).select("-password");

    await logAction(req, "user.phone_change", "User", req.params.id, {
      before: { phone: target.phone || null }, after: { phone: next || null },
    });
    res.json({ user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Ce numéro de téléphone est déjà utilisé par un autre compte." });
    }
    logger.error("adminUpdatePhone:", err);
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

    const before = target.adminScope || [];
    // Filet de sécurité final (voir aussi la confirmation ajoutée côté
    // AdminPanel.jsx, toggleAdminScope) : sans ce garde, retirer l'accès
    // complet au DERNIER admin qui l'a encore rendait la plateforme
    // impossible à administrer depuis l'UI — updateAdminScope exige déjà un
    // accès complet ou super_admin pour modifier des scopes, donc plus
    // personne n'aurait pu se le rendre.
    const wasFullAccess = before.length === 0 || before.includes("super_admin");
    const willBeFullAccess = scope.length === 0 || scope.includes("super_admin");
    if (wasFullAccess && !willBeFullAccess) {
      // isActive:true est indispensable ici (bug réel trouvé en audit) — sans
      // lui, un admin à accès complet mais DÉSACTIVÉ compte quand même comme
      // un filet de sécurité valide, ce qui permet de retirer l'accès complet
      // au dernier admin réellement actif et donc de verrouiller la plateforme.
      const otherFullAccess = await User.countDocuments({
        role: "admin",
        isActive: true,
        _id: { $ne: target._id },
        $or: [{ adminScope: { $size: 0 } }, { adminScope: "super_admin" }],
      });
      if (otherFullAccess === 0) {
        return res.status(400).json({ message: "Impossible : au moins un administrateur doit conserver l'accès complet sur la plateforme." });
      }
    }

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

    // Bug réel corrigé (audit) : la suppression ne touchait QUE le compte
    // User lui-même — ses annonces véhicule/profils chauffeur restaient
    // visibles dans le catalogue public avec un `owner` pointant vers un
    // compte qui n'existe plus ("annonces fantômes"), et l'email/téléphone
    // du compte supprimé redevenait bien libre pour une réinscription (voir
    // tests/reRegisterAfterDelete.test.js) mais laissait ces données
    // orphelines traîner indéfiniment. Nettoyage réel demandé — supprimées
    // pour de bon, SAUF celles ayant déjà au moins une réservation
    // (Booking.vehicle/driver) : Booking ne stocke aucune copie des détails
    // du véhicule/chauffeur (juste une référence), donc les supprimer
    // casserait l'historique de réservation d'un AUTRE utilisateur (le
    // client qui a réservé) — dans ce seul cas, on archive à la place
    // (retiré du catalogue public, jamais supprimé).
    const [ownedVehicles, ownedDrivers] = await Promise.all([
      Vehicle.find({ owner: req.params.id }).select("_id").lean(),
      Driver.find({ owner: req.params.id }).select("_id").lean(),
    ]);
    const vehicleIds = ownedVehicles.map((v) => v._id);
    const driverIds  = ownedDrivers.map((d) => d._id);

    const [vehiclesWithBookings, driversWithBookings] = await Promise.all([
      vehicleIds.length ? Booking.distinct("vehicle", { vehicle: { $in: vehicleIds } }) : [],
      driverIds.length  ? Booking.distinct("driver",  { driver:  { $in: driverIds } })  : [],
    ]);
    const bookedVehicleIds = new Set(vehiclesWithBookings.map(String));
    const bookedDriverIds  = new Set(driversWithBookings.map(String));

    const vehiclesToDelete  = vehicleIds.filter((id) => !bookedVehicleIds.has(String(id)));
    const vehiclesToArchive = vehicleIds.filter((id) => bookedVehicleIds.has(String(id)));
    const driversToDelete   = driverIds.filter((id) => !bookedDriverIds.has(String(id)));
    const driversToArchive  = driverIds.filter((id) => bookedDriverIds.has(String(id)));

    const [vehiclesDeleted, vehiclesArchived, driversDeleted, driversArchived] = await Promise.all([
      vehiclesToDelete.length  ? Vehicle.deleteMany({ _id: { $in: vehiclesToDelete } })  : Promise.resolve({ deletedCount: 0 }),
      vehiclesToArchive.length ? Vehicle.updateMany({ _id: { $in: vehiclesToArchive } }, { $set: { available: false, status: "archived" } }) : Promise.resolve({ modifiedCount: 0 }),
      driversToDelete.length   ? Driver.deleteMany({ _id: { $in: driversToDelete } })    : Promise.resolve({ deletedCount: 0 }),
      driversToArchive.length  ? Driver.updateMany({ _id: { $in: driversToArchive } }, { $set: { status: "archived" } }) : Promise.resolve({ modifiedCount: 0 }),
    ]);

    // Journal d'audit global (suppression de compte — action sensible et irréversible)
    await logAction(req, "user.delete", "User", req.params.id, {
      before: { email: user.email, role: user.role },
      cleanup: {
        vehiclesDeleted: vehiclesDeleted.deletedCount, vehiclesArchived: vehiclesArchived.modifiedCount,
        driversDeleted: driversDeleted.deletedCount, driversArchived: driversArchived.modifiedCount,
      },
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

    // Notifier l'admin — bug réel corrigé (audit) : Notification.insertMany
    // ne pousse jamais l'événement socket temps réel (même trou déjà comblé
    // pour vehicle/driver/KYC/showroom/Import-Export) — basculé sur
    // notifyAdmins() (email + in-app + socket, un seul mécanisme partout).
    notifyAdmins(
      "system",
      "📋 Nouvelle pièce d'identité soumise",
      `${user.firstName} ${user.lastName} a soumis sa pièce d'identité.`,
      "/admin",
    ).catch((e) => logger.error("notifyAdmins submitIdentity (non bloquant) :", e.message));

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

const APP_URL = () => process.env.APP_URL || "https://vit-auto.com";
const EMAIL_CHANGE_TTL = 24 * 60 * 60 * 1000; // 24h — même durée que la vérification à l'inscription

// ── Demander un changement d'adresse e-mail (connecté) ────────────────────
// N'écrit jamais directement `user.email` — l'ancienne adresse reste active
// tant que la nouvelle n'est pas confirmée via le lien envoyé (voir
// authController.confirmEmailChange). Corrige un bug réel : le champ email
// du formulaire Profil était éditable côté UI mais absent de la liste
// blanche `allowed` d'updateMyProfile ci-dessus — toute modification était
// donc silencieusement ignorée par le serveur.
export const requestEmailChange = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      // Même correctif que changePassword (authController.js) : un compte
      // Google a un mot de passe aléatoire jamais connu de l'utilisateur.
      if (user.authProvider === "google") {
        return res.status(401).json({
          message: "Ce compte a été créé via Google et n'a pas de mot de passe classique. Utilisez « Mot de passe oublié » sur la page de connexion pour en définir un, puis réessayez.",
          code: "GOOGLE_ACCOUNT_NO_PASSWORD",
        });
      }
      return res.status(401).json({ message: "Mot de passe incorrect." });
    }

    if (newEmail === user.email) {
      return res.status(400).json({ message: "Cette adresse est déjà la vôtre." });
    }
    // Vérifie à la fois les emails déjà actifs ET les changements déjà en
    // attente d'un autre compte — sans ce second contrôle, deux utilisateurs
    // pourraient réclamer simultanément la même nouvelle adresse.
    const taken = await User.findOne({
      _id: { $ne: user._id },
      $or: [{ email: newEmail }, { pendingEmail: newEmail }],
    });
    if (taken) return res.status(409).json({ message: "Cette adresse e-mail est déjà utilisée." });

    const token = crypto.randomBytes(32).toString("hex");
    user.pendingEmail        = newEmail;
    user.pendingEmailToken   = token;
    user.pendingEmailExpires = new Date(Date.now() + EMAIL_CHANGE_TTL);
    await user.save();

    const confirmUrl = `${APP_URL()}/confirm-email-change?token=${token}`;
    await dispatch.emailChangeConfirmation(newEmail, user._id.toString(), confirmUrl, user.firstName, newEmail).catch(() => {});

    res.json({ message: "Un e-mail de confirmation a été envoyé à votre nouvelle adresse.", pendingEmail: newEmail });
  } catch (err) {
    logger.error("requestEmailChange:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Auto-désactivation du compte (connecté) ───────────────────────────────
// Désactivation réversible (contacter le support pour réactiver), pas une
// suppression définitive — l'effacement RGPD/suppression dure des données
// (réservations, factures, documents KYC liés) nécessite un arbitrage
// produit/légal séparé, volontairement hors scope ici.
export const deactivateMyAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      // Même correctif que changePassword (authController.js) : un compte
      // Google a un mot de passe aléatoire jamais connu de l'utilisateur.
      if (user.authProvider === "google") {
        return res.status(401).json({
          message: "Ce compte a été créé via Google et n'a pas de mot de passe classique. Utilisez « Mot de passe oublié » sur la page de connexion pour en définir un, puis réessayez.",
          code: "GOOGLE_ACCOUNT_NO_PASSWORD",
        });
      }
      return res.status(401).json({ message: "Mot de passe incorrect." });
    }

    user.isActive = false;
    user.refreshTokens = [];
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await logAction(req, "user.self_deactivate", "User", user._id, {
      before: { isActive: true },
      after:  { isActive: false },
    });

    res.json({ message: "Votre compte a été désactivé. Contactez le support pour le réactiver." });
  } catch (err) {
    logger.error("deactivateMyAccount:", err);
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
