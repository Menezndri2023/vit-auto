import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

// ── Constantes tarifaires ─────────────────────────────────────
const PLAN_PRICE_XOF   = 25000; // Abonnement Pro : 25 000 FCFA/mois
const BOOST_PRICE_XOF  = 5000;  // Mise en avant  :  5 000 FCFA/annonce
const COMMISSION_LOCATION = 0.15; // 15 % sur location
const COMMISSION_VENTE    = 0.03; //  3 % sur vente
const SERVICE_FEE_XOF  = 1000;  // Frais de service : 1 000 FCFA

// Récupère ou crée l'abonnement du vendeur connecté
export const getMySubscription = async (req, res) => {
  try {
    let sub = await Subscription.findOne({ vendor: req.user.id });
    if (!sub) {
      sub = await Subscription.create({ vendor: req.user.id, plan: "free" });
    }
    res.json({
      subscription: sub,
      pricing: {
        planPriceXOF: PLAN_PRICE_XOF,
        boostPriceXOF: BOOST_PRICE_XOF,
        commissionLocation: COMMISSION_LOCATION,
        commissionVente: COMMISSION_VENTE,
        serviceFeeFCFA: SERVICE_FEE_XOF,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur récupération abonnement.", error: err.message });
  }
};

// Active / renouvelle le plan Pro
export const activatePro = async (req, res) => {
  try {
    let sub = await Subscription.findOne({ vendor: req.user.id });
    if (!sub) sub = new Subscription({ vendor: req.user.id });

    const startDate = new Date();
    const endDate   = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // +1 mois

    sub.plan = "pro";
    sub.proDetails = {
      startDate,
      endDate,
      isActive: true,
      priceXOF: PLAN_PRICE_XOF,
    };

    const period = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;
    sub.paymentHistory.push({
      amount: PLAN_PRICE_XOF,
      method: req.body.paymentMethod || "card",
      paidAt: new Date(),
      status: "completed",
      period,
    });

    await sub.save();
    res.json({ message: "Plan Pro activé avec succès.", subscription: sub });
  } catch (err) {
    res.status(500).json({ message: "Erreur activation Pro.", error: err.message });
  }
};

// Achète un boost pour une annonce
export const purchaseBoost = async (req, res) => {
  try {
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ message: "vehicleId requis." });

    let sub = await Subscription.findOne({ vendor: req.user.id });
    if (!sub) sub = new Subscription({ vendor: req.user.id });

    const startDate = new Date();
    const endDate   = new Date();
    endDate.setDate(endDate.getDate() + 30); // 30 jours de mise en avant

    sub.boosts.push({
      vehicle:  vehicleId,
      startDate,
      endDate,
      isActive: true,
      priceXOF: BOOST_PRICE_XOF,
      paidAt:   new Date(),
    });

    await sub.save();
    res.json({ message: "Mise en avant activée pour 30 jours.", subscription: sub });
  } catch (err) {
    res.status(500).json({ message: "Erreur boost.", error: err.message });
  }
};

// Calcule la commission sur une transaction
export const computeCommission = (montantBase, type) => {
  const rate   = type === "location" ? COMMISSION_LOCATION : COMMISSION_VENTE;
  const amount = Math.round(montantBase * rate);
  const payout = Math.round(montantBase - amount - SERVICE_FEE_XOF);
  return { rate, amount, serviceFeeFCFA: SERVICE_FEE_XOF, partnerPayout: Math.max(payout, 0) };
};

// Retourne les infos tarifaires publiques (sans auth)
export const getPricing = async (_req, res) => {
  res.json({
    commissions: {
      location: { rate: COMMISSION_LOCATION, label: "15 % sur chaque location" },
      vente:    { rate: COMMISSION_VENTE,    label: "3 % sur chaque vente" },
    },
    fraisService: { montant: SERVICE_FEE_XOF, label: "1 000 FCFA par réservation" },
    plans: [
      {
        id: "free",
        name: "Gratuit",
        priceXOF: 0,
        features: [
          "Publication illimitée",
          "Commission 15% (location) / 3% (vente)",
          "Frais de service : 1 000 FCFA/réservation",
          "Visibilité standard",
        ],
      },
      {
        id: "pro",
        name: "Pro",
        priceXOF: PLAN_PRICE_XOF,
        features: [
          "Tout du plan Gratuit",
          "Annonces mises en avant automatiquement",
          "Badge Vendeur Pro",
          "Statistiques avancées",
          "Support prioritaire",
          "1 boost d'annonce offert/mois",
        ],
      },
    ],
    boosts: [
      {
        id: "boost_30",
        name: "Mise en avant 30 jours",
        priceXOF: BOOST_PRICE_XOF,
        description: "Votre annonce apparaît en première position pendant 30 jours.",
      },
    ],
  });
};
