import logger from "../utils/logger.js";
import Subscription from "../models/Subscription.js";
import { planRank } from "../constants/subscriptionPlans.js";
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MESSAGE } from "../config/featureFlags.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import Notification from "../models/Notification.js";

// Méthodes qui déclencheraient un ENCAISSEMENT réel. Elles seules dépendent
// d'une passerelle branchée.
//
// « support » n'en fait pas partie, et c'est tout l'objet de cette distinction :
// demander un plan ne prend pas d'argent, cela enregistre une intention qu'un
// administrateur confirme ensuite à la main. Refuser cette demande revenait à
// fermer la seule voie ouverte — celle que l'interface annonce au partenaire.
const METHODES_ENCAISSANTES = ["card", "stripe", "paypal", "orange_money", "wave", "mobile_money", "cash"];
const encaisse = (methode) => METHODES_ENCAISSANTES.includes(String(methode || "").toLowerCase());
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import { getSubscriptionPrice, getBoostPrice, applyDiscountCode, redeemDiscountCodeByCode } from "../services/pricingEngine.js";
import { isMalformedObjectId } from "../utils/objectId.js";

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

    // Seul un moyen qui PRÉLÈVE de l'argent dépend d'une passerelle branchée.
    // Une demande au support n'en prélève aucun : elle doit rester possible,
    // sans quoi le partenaire n'a plus aucun moyen d'obtenir son plan.
    if (!PAYMENTS_ENABLED && encaisse(paymentMethod)) {
      return res.status(503).json({ message: PAYMENTS_DISABLED_MESSAGE, code: "PAYMENTS_DISABLED" });
    }
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
      method: paymentMethod || (PAYMENTS_ENABLED ? "card" : "support"),
      paidAt: new Date(),
      status: "pending",
      period,
      promoCode: campaign?.code || null,
    });

    // Le code n'est décompté qu'à la confirmation admin d'un paiement
    // réellement reçu (adminApprovePlanPayment) — jamais ici, une simple
    // demande "pending" ne doit jamais consommer une utilisation limitée.
    await sub.save();

    // Sans cette notification, la demande dormait dans un onglet que personne
    // n'ouvre : le partenaire attendait une activation que l'administration
    // ignorait avoir à faire. Non bloquante — une notification manquée ne doit
    // pas faire échouer une demande déjà enregistrée.
    await notifyAdmins(
      "system",
      "💳 Demande d'abonnement partenaire",
      `${req.user.firstName || "Un partenaire"} ${req.user.lastName || ""} demande le plan « ${planTier} » (${priceUSD} USD). À confirmer dans Finance › Paiements.`.trim(),
      "/admin?tab=paiements"
    ).catch(() => {});

    res.status(202).json({
      message: PAYMENTS_ENABLED
        ? "Demande d'activation enregistrée, en attente de confirmation du paiement par un administrateur."
        : "Demande envoyée au support. Un administrateur vous contactera pour activer votre plan.",
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
    const { vehicleId, tier, promoCode, paymentMethod } = req.body;
    if (!PAYMENTS_ENABLED && encaisse(paymentMethod)) {
      return res.status(503).json({ message: PAYMENTS_DISABLED_MESSAGE, code: "PAYMENTS_DISABLED" });
    }
    if (!vehicleId) return res.status(400).json({ message: "vehicleId requis." });
    // Sans ce contrôle, un vehicleId malformé lève un CastError → 500.
    if (isMalformedObjectId(vehicleId)) return res.status(400).json({ message: "vehicleId invalide." });
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

    await notifyAdmins(
      "system",
      "⭐ Demande de mise en avant",
      `${req.user.firstName || "Un partenaire"} demande une mise en avant « ${tier} » (${priceUSD} USD). À confirmer dans Finance › Paiements.`,
      "/admin?tab=paiements"
    ).catch(() => {});

    res.status(202).json({
      message: PAYMENTS_ENABLED
        ? "Demande de mise en avant enregistrée, en attente de confirmation du paiement."
        : "Demande envoyée au support. Un administrateur activera votre mise en avant.",
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

// Recopie le rang d'abonnement du partenaire sur TOUTES ses annonces, pour que
// le tri du catalogue en tienne compte sans jointure (voir Vehicle.ownerPlanRank).
// Appelée à chaque changement d'état d'un plan — activation, rejet, expiration
// constatée. Jamais bloquante : une annonce mal classée est un défaut de
// visibilité, pas une raison de faire échouer l'activation d'un abonnement déjà
// payé.
async function syncOwnerPlanOnVehicles(vendorId, plan, endDate) {
  try {
    await Vehicle.updateMany(
      { owner: vendorId },
      { $set: { ownerPlanRank: planRank(plan), ownerPlanUntil: endDate || null } }
    );
  } catch (err) {
    logger.error("syncOwnerPlanOnVehicles:", err.message);
  }
}

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
    await syncOwnerPlanOnVehicles(sub.vendor, sub.plan, endDate);

    // Le partenaire doit savoir que son plan est actif : sans cela, il attend
    // une réponse qui ne vient jamais et redemande.
    await Notification.create({
      user: sub.vendor,
      type: "system",
      titre: "✅ Votre plan est actif",
      message: `Le plan « ${sub.plan} » est activé jusqu'au ${endDate.toLocaleDateString("fr-FR")} : commission réduite et classement prioritaire de vos annonces.`,
      lien: "/vendor/dashboard",
    }).catch((err) => logger.error("notification plan actif (non bloquant) :", err.message));
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
    // Garde de statut absente ici (contrairement à adminApprovePlanPayment) :
    // un admin travaillant sur une liste non rafraîchie pouvait rejeter un
    // paiement DÉJÀ confirmé. Le vendeur gardait alors son plan payant actif
    // (et son taux de commission premium) pendant que la comptabilité affichait
    // « paiement échoué ».
    if (entry.status !== "pending") {
      return res.status(409).json({ message: `Ce paiement n'est plus en attente (statut actuel : ${entry.status}).` });
    }
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

    // C'est ICI que la mise en avant prend réellement effet sur l'annonce.
    // Auparavant, seul le sous-document `sub.boosts` était écrit : le
    // partenaire payait, l'admin confirmait, et le catalogue ne changeait
    // strictement pas (Vehicle.boostLevel / sponsoredUntil n'étaient lus nulle
    // part, le tri se faisant uniquement par date de création).
    // `boostLevel` porte le poids du palier : à date de validité égale, un
    // boost international passe devant un boost 24h.
    const BOOST_WEIGHT = { "24h": 1, "7d": 2, "30d": 3, international: 4 };
    if (boost.vehicle) {
      await Vehicle.findByIdAndUpdate(boost.vehicle, {
        $set: {
          sponsoredUntil: boost.endDate,
          boostLevel: BOOST_WEIGHT[boost.tier] ?? 1,
        },
      });
    }

    // Paiement réellement confirmé — c'est le seul moment où un code promo
    // éventuel est décompté (voir redeemDiscountCode/pricingEngine.js).
    if (boost.promoCode) await redeemDiscountCodeByCode(boost.promoCode);
    res.json({ message: "Mise en avant activée.", subscription: sub });
  } catch (err) {
    res.status(500).json({ message: "Erreur confirmation boost.", error: err.message });
  }
};
