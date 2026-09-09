import logger from "../utils/logger.js";
import User from "../models/User.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { LOYALTY_TIERS, resolveTier, resolveNextTier } from "../constants/loyaltyTiers.js";

// ── Mon statut fidélité (solde, palier, progression) ──────────────────────
export const getMyLoyaltyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("loyaltyPoints loyaltyLifetimePoints loyaltyTier")
      .lean();
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    const tier = resolveTier(user.loyaltyLifetimePoints);
    const { nextTier, pointsToNextTier } = resolveNextTier(user.loyaltyLifetimePoints);

    res.json({
      points:         user.loyaltyPoints,
      lifetimePoints: user.loyaltyLifetimePoints,
      tier,
      nextTier,
      pointsToNextTier,
    });
  } catch (err) {
    logger.error("getMyLoyaltyStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Historique de mes mouvements de points (paginé) ────────────────────────
export const getMyLoyaltyHistory = async (req, res) => {
  try {
    const page  = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip  = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      LoyaltyTransaction.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LoyaltyTransaction.countDocuments({ user: req.user._id }),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("getMyLoyaltyHistory:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Fidélité d'un client — vue administrateur ─────────────────────────────
// N'existait pas : seul le titulaire d'un compte pouvait consulter son solde
// et ses mouvements. Or 100 points = 1 USD de remise à la réservation suivante
// (voir bookingController.createBooking, pointsToRedeem) : c'est un solde à
// valeur monétaire, qu'un administrateur doit pouvoir vérifier quand un client
// conteste une remise, ou quand un solde paraît incohérent.
//
// LECTURE SEULE, volontairement : aucun ajustement manuel n'est exposé ici.
// Créditer des points revient à créditer de l'argent — cela n'irait pas sans
// motif obligatoire, écriture dans LoyaltyTransaction et trace au journal
// d'audit, ce qui est une décision produit à part entière, pas un corollaire
// de la consultation.
export const getUserLoyaltyAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const page  = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const user = await User.findById(userId)
      .select("firstName lastName email loyaltyPoints loyaltyLifetimePoints loyaltyTier")
      .lean();
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    const [transactions, total] = await Promise.all([
      LoyaltyTransaction.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("booking", "reference")
        .lean(),
      LoyaltyTransaction.countDocuments({ user: userId }),
    ]);

    // Le palier est RECALCULÉ depuis le cumul à vie plutôt que lu sur
    // User.loyaltyTier : c'est précisément l'écart entre les deux qu'un admin
    // vient chercher ici quand un palier semble faux.
    const tier = resolveTier(user.loyaltyLifetimePoints);
    const { nextTier, pointsToNextTier } = resolveNextTier(user.loyaltyLifetimePoints);

    res.json({
      user: {
        id: user._id,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        email: user.email,
      },
      points:         user.loyaltyPoints || 0,
      lifetimePoints: user.loyaltyLifetimePoints || 0,
      tier,
      storedTier:     user.loyaltyTier || null,
      nextTier,
      pointsToNextTier,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error("getUserLoyaltyAdmin:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Grille des paliers (public — page marketing) ───────────────────────────
export const getLoyaltyTiers = (req, res) => {
  res.json({ tiers: LOYALTY_TIERS });
};
