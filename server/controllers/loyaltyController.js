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

// ── Grille des paliers (public — page marketing) ───────────────────────────
export const getLoyaltyTiers = (req, res) => {
  res.json({ tiers: LOYALTY_TIERS });
};
