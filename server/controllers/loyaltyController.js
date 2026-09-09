import logger from "../utils/logger.js";
import User from "../models/User.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { LOYALTY_TIERS, MANUAL_ADJUSTMENT_PREFIX, MAX_MANUAL_ADJUSTMENT_POINTS, POINTS_PER_USD, pointsToUSD, resolveTier, resolveNextTier } from "../constants/loyaltyTiers.js";
import { logAction } from "../middleware/auditLog.js";

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
      // Ce que le solde vaut réellement, en USD (pivot de toute la
      // tarification) : l'interface le convertit ensuite dans la devise du
      // client. Renvoyer le taux évite au front de le réécrire en dur — le
      // client verrait sinon une valeur qui cesserait de correspondre à la
      // remise réellement appliquée le jour où le taux change.
      pointsValueUSD: pointsToUSD(user.loyaltyPoints),
      pointsPerUSD:   POINTS_PER_USD,
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
      pointsValueUSD: pointsToUSD(user.loyaltyPoints),
      pointsPerUSD:   POINTS_PER_USD,
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

// ── Ajustement manuel du solde par un administrateur ──────────────────────
// Créditer des points, c'est créditer de l'argent (voir POINTS_PER_USD) : cette
// route est donc la seule écriture manuelle sur un solde, et elle est encadrée.
//
//   • motif OBLIGATOIRE et conservé tel quel — un mouvement sans explication
//     est inexploitable six mois plus tard, autant pour le support que pour le
//     client qui le découvre dans son historique ;
//   • trace dans LoyaltyTransaction (avec l'auteur) ET au journal d'audit ;
//   • secteur "finance" exigé, et non "users" comme la simple consultation :
//     lire un solde et le modifier ne sont pas le même pouvoir ;
//   • un administrateur ne peut pas s'ajuster lui-même ;
//   • plafond par geste (MAX_MANUAL_ADJUSTMENT_POINTS) ;
//   • débit atomique conditionnel — un solde ne devient jamais négatif, même
//     si le client dépense ses points au même instant.
//
// Par défaut un crédit n'augmente QUE le solde dépensable, jamais le cumul à
// vie qui détermine le palier : un geste commercial ne doit pas promouvoir
// silencieusement un client vers un palier qui lui donnerait un multiplicateur
// permanent. `countsTowardTier` permet de le faire quand c'est justement le
// but (rattrapage de points qui auraient dû être attribués), mais c'est alors
// une décision explicite.
export const adjustUserLoyalty = async (req, res) => {
  try {
    const { userId } = req.params;
    const { direction, reason, countsTowardTier = false } = req.body || {};

    if (!["credit", "debit"].includes(direction)) {
      return res.status(400).json({ message: "Sens invalide : « credit » ou « debit »." });
    }

    const points = Number(req.body?.points);
    if (!Number.isInteger(points) || points <= 0) {
      return res.status(400).json({ message: "Nombre de points invalide (entier positif attendu)." });
    }
    if (points > MAX_MANUAL_ADJUSTMENT_POINTS) {
      return res.status(400).json({
        message: `Ajustement plafonné à ${MAX_MANUAL_ADJUSTMENT_POINTS} points par opération (${pointsToUSD(MAX_MANUAL_ADJUSTMENT_POINTS)} USD).`,
      });
    }

    const motif = String(reason || "").trim();
    if (motif.length < 3) {
      return res.status(400).json({ message: "Motif obligatoire (3 caractères minimum)." });
    }
    if (motif.length > 300) {
      return res.status(400).json({ message: "Motif trop long (300 caractères maximum)." });
    }

    // Conflit d'intérêts : personne ne crédite son propre compte.
    if (String(req.user?._id) === String(userId)) {
      return res.status(403).json({ message: "Un administrateur ne peut pas ajuster son propre solde." });
    }

    const before = await User.findById(userId).select("loyaltyPoints loyaltyLifetimePoints loyaltyTier").lean();
    if (!before) return res.status(404).json({ message: "Utilisateur introuvable." });

    let updated;
    if (direction === "debit") {
      // Conditionnel : si le solde a baissé entre-temps, la mise à jour ne
      // s'applique pas du tout plutôt que de creuser un solde négatif.
      const result = await User.findOneAndUpdate(
        { _id: userId, loyaltyPoints: { $gte: points } },
        { $inc: { loyaltyPoints: -points } },
        { new: true }
      ).select("loyaltyPoints loyaltyLifetimePoints loyaltyTier");
      if (!result) {
        return res.status(409).json({
          message: `Solde insuffisant : ${before.loyaltyPoints || 0} point(s) disponible(s).`,
        });
      }
      updated = result;
    } else {
      const inc = { loyaltyPoints: points };
      if (countsTowardTier === true) inc.loyaltyLifetimePoints = points;
      updated = await User.findByIdAndUpdate(userId, { $inc: inc }, { new: true })
        .select("loyaltyPoints loyaltyLifetimePoints loyaltyTier");
    }

    // Le palier suit le cumul à vie — il ne bouge donc que si l'ajustement a
    // explicitement été compté dedans.
    const tier = resolveTier(updated.loyaltyLifetimePoints);
    if (updated.loyaltyTier !== tier.key) {
      await User.updateOne({ _id: userId }, { $set: { loyaltyTier: tier.key } });
    }

    await LoyaltyTransaction.create({
      user:         userId,
      type:         direction,
      points,
      reason:       `${MANUAL_ADJUSTMENT_PREFIX}${motif}`,
      adjustedBy:   req.user?._id ?? null,
      balanceAfter: updated.loyaltyPoints,
      tierAtTime:   tier.key,
    });

    await logAction(req, `loyalty.adjust.${direction}`, "User", userId, {
      before: { points: before.loyaltyPoints || 0, lifetimePoints: before.loyaltyLifetimePoints || 0, tier: before.loyaltyTier },
      after:  { points: updated.loyaltyPoints, lifetimePoints: updated.loyaltyLifetimePoints, tier: tier.key, motif, countsTowardTier: countsTowardTier === true },
    });

    res.json({
      points:         updated.loyaltyPoints,
      lifetimePoints: updated.loyaltyLifetimePoints,
      pointsValueUSD: pointsToUSD(updated.loyaltyPoints),
      tier,
    });
  } catch (err) {
    logger.error("adjustUserLoyalty:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Grille des paliers (public — page marketing) ───────────────────────────
export const getLoyaltyTiers = (req, res) => {
  res.json({ tiers: LOYALTY_TIERS, pointsPerUSD: POINTS_PER_USD });
};
