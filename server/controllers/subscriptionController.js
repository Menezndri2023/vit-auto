import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import { getSubscriptionPrice, getBoostPrice, applyDiscountCode, redeemDiscountCodeByCode } from "../services/pricingEngine.js";

const PLAN_TIERS  = ["individuel_plus", "business", "exportateur"];
const BOOST_TIERS = ["24h", "7d", "30d", "international"];

// Durée de chaque palier de boost — voir PricingConfig.boosts (montants) et
// cahier des charges "Options de boost configurables" (durées, elles, ne sont
// pas éditables admin : ce sont des paliers de temps fixes par construction).
const BOOST_DURATION_MS = {
  "24h":          24 * 60 * 60 * 1000,
  "7d":           7  * 24 * 60 * 60 * 1000,
  "30d":          30 * 24 * 60 * 60 * 1000,
  international:  30 * 24 * 60 * 60 * 1000,
};

// Récupère ou crée l'abonnement du vendeur connecté
export const getMySubscription = async (req, res) => {
  try {
    let sub = await Subscription.findOne({ vendor: req.user.id });
    if (!sub) {
      sub = await Subscription.create({ vendor: req.user.id, plan: "free" });
    }
    const pricing = {};
    for (const tier of PLAN_TIERS) pricing[tier] = await getSubscriptionPrice(tier);
    const boostPricing = {};
    for (const tier of BOOST_TIERS) boostPricing[tier] = await getBoostPrice(tier);

    res.json({ subscription: sub, pricing: { plans: pricing, boosts: boostPricing } });
  } catch (err) {
    res.status(500).json({ message: "Erreur récupération abonnement.", error: err.message });
  }
};

// Demande d'activation d'un plan payant — aucun prestataire de paiement récurrent
// réel n'étant branché à ce jour, on n'active PAS le plan automatiquement : la
// demande est enregistrée "pending" et un admin doit confirmer la réception
// réelle du paiement (même mécanisme que createPayment/booking).
export const activatePlan = async (req, res) => {
  try {
    const { planTier, paymentMethod, promoCode } = req.body;
    if (!PLAN_TIERS.includes(planTier)) {
      return res.status(400).json({ message: `Palier invalide. Attendu : ${PLAN_TIERS.join(", ")}.` });
    }
    const basePriceUSD = await getSubscriptionPrice(planTier);
    if (basePriceUSD == null) return res.status(503).json({ message: "Tarification indisponible pour le moment." });

    let priceUSD, campaign;
    try {
      ({ priceUSD, campaign } = await applyDiscountCode(promoCode, "subscriptions", basePriceUSD));
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    let sub = await Subscription.findOne({ vendor: req.user.id });
    if (!sub) sub = new Subscription({ vendor: req.user.id });

    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    sub.paymentHistory.push({
      planTier,
      amount: priceUSD,
      method: paymentMethod || "card",
      paidAt: new Date(),
      status: "pending",
      period,
      promoCode: campaign?.code || null,
    });

    // Le code n'est décompté qu'à la confirmation admin d'un paiement
    // réellement reçu (adminApprovePlanPayment) — jamais ici, une simple
    // demande "pending" ne doit jamais consommer une utilisation limitée.
    await sub.save();

    res.status(202).json({
      message: "Demande d'activation enregistrée, en attente de confirmation du paiement par un administrateur.",
      subscription: sub,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur activation du plan.", error: err.message });
  }
};

// Achète un boost pour une annonce — même logique : enregistré "pending", pas d'activation
// immédiate tant qu'aucune vérification réelle de paiement n'est branchée.
export const purchaseBoost = async (req, res) => {
  try {
    const { vehicleId, tier, promoCode } = req.body;
    if (!vehicleId) return res.status(400).json({ message: "vehicleId requis." });
    if (!BOOST_TIERS.includes(tier)) {
      return res.status(400).json({ message: `Palier de boost invalide. Attendu : ${BOOST_TIERS.join(", ")}.` });
    }

    // Le véhicule doit appartenir au vendeur qui demande le boost.
    const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: req.user.id });
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable ou ne vous appartenant pas." });

    const basePriceUSD = await getBoostPrice(tier);
    if (basePriceUSD == null) return res.status(503).json({ message: "Tarification indisponible pour le moment." });

    let priceUSD, campaign;
    try {
      ({ priceUSD, campaign } = await applyDiscountCode(promoCode, "boosts", basePriceUSD));
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    let sub = await Subscription.findOne({ vendor: req.user.id });
    if (!sub) sub = new Subscription({ vendor: req.user.id });

    sub.boosts.push({
      vehicle: vehicleId,
      tier,
      isActive: false, // activé par un admin après confirmation du paiement
      priceUSD,
      paidAt: null,
      promoCode: campaign?.code || null,
    });

    // Le code n'est décompté qu'à la confirmation admin (adminApproveBoost) —
    // jamais ici (voir activatePlan ci-dessus pour la même correction).
    await sub.save();

    res.status(202).json({
      message: "Demande de mise en avant enregistrée, en attente de confirmation du paiement.",
      subscription: sub,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur boost.", error: err.message });
  }
};

// ── ADMIN : demandes de plan/boost en attente de confirmation de paiement ────
export const getPendingSubscriptionRequests = async (_req, res) => {
  try {
    const subs = await Subscription.find({
      $or: [
        { "paymentHistory.status": "pending" },
        { "boosts.isActive": false },
      ],
    }).populate("vendor", "firstName lastName email");
    res.json({ subscriptions: subs });
  } catch (err) {
    res.status(500).json({ message: "Erreur récupération des demandes.", error: err.message });
  }
};

// ── ADMIN : confirme la réception réelle du paiement → active le plan ───────
export const adminApprovePlanPayment = async (req, res) => {
  try {
    const { subscriptionId, paymentId } = req.params;
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) return res.status(404).json({ message: "Abonnement introuvable." });

    const entry = sub.paymentHistory.id(paymentId);
    if (!entry) return res.status(404).json({ message: "Paiement introuvable." });
    if (entry.status !== "pending") return res.status(409).json({ message: "Ce paiement n'est plus en attente." });

    entry.status = "completed";

    const startDate = new Date();
    const endDate   = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    sub.plan = entry.planTier;
    sub.planDetails = { startDate, endDate, isActive: true, priceUSD: entry.amount };

    await sub.save();
    // Paiement réellement confirmé — c'est le seul moment où un code promo
    // éventuel est décompté (voir redeemDiscountCode/pricingEngine.js).
    if (entry.promoCode) await redeemDiscountCodeByCode(entry.promoCode);
    res.json({ message: "Plan activé.", subscription: sub });
  } catch (err) {
    res.status(500).json({ message: "Erreur confirmation du plan.", error: err.message });
  }
};

// ── ADMIN : rejette une demande de plan en attente (paiement non reçu) ───────
export const adminRejectPlanPayment = async (req, res) => {
  try {
    const { subscriptionId, paymentId } = req.params;
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) return res.status(404).json({ message: "Abonnement introuvable." });
    const entry = sub.paymentHistory.id(paymentId);
    if (!entry) return res.status(404).json({ message: "Paiement introuvable." });
    entry.status = "failed";
    await sub.save();
    res.json({ message: "Demande rejetée.", subscription: sub });
  } catch (err) {
    res.status(500).json({ message: "Erreur rejet.", error: err.message });
  }
};

// ── ADMIN : confirme la réception réelle du paiement boost → active selon le palier ─
export const adminApproveBoost = async (req, res) => {
  try {
    const { subscriptionId, boostId } = req.params;
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) return res.status(404).json({ message: "Abonnement introuvable." });
    const boost = sub.boosts.id(boostId);
    if (!boost) return res.status(404).json({ message: "Boost introuvable." });
    if (boost.isActive) return res.status(409).json({ message: "Ce boost est déjà actif." });

    const startDate = new Date();
    const durationMs = BOOST_DURATION_MS[boost.tier] ?? BOOST_DURATION_MS["30d"];
    boost.startDate = startDate;
    boost.endDate   = new Date(startDate.getTime() + durationMs);
    boost.isActive  = true;
    boost.paidAt    = new Date();

    await sub.save();
    // Paiement réellement confirmé — c'est le seul moment où un code promo
    // éventuel est décompté (voir redeemDiscountCode/pricingEngine.js).
    if (boost.promoCode) await redeemDiscountCodeByCode(boost.promoCode);
    res.json({ message: "Mise en avant activée.", subscription: sub });
  } catch (err) {
    res.status(500).json({ message: "Erreur confirmation boost.", error: err.message });
  }
};
