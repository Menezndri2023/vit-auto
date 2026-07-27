import logger from "../utils/logger.js";
import SiteContent from "../models/SiteContent.js";

// ── GET /api/site-content/hero — public ──────────────────────────────────────
export const getHero = async (req, res) => {
  try {
    const doc = await SiteContent.findById("hero")
      .populate("heroSpotlights", "title images image pricePerDay buyPrice priceForSale listingType mode ville marque modele")
      .lean();
    res.json({
      heroTitle:      doc?.heroTitle || "",
      heroSubtitle:   doc?.heroSubtitle || "",
      heroSpotlights: doc?.heroSpotlights || [],
    });
  } catch (err) {
    logger.error("getHero:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/site-content/hero — admin ─────────────────────────────────────
export const updateHero = async (req, res) => {
  try {
    const { heroTitle, heroSubtitle, heroSpotlights } = req.body;
    const update = { updatedAt: new Date(), updatedBy: req.user.id };
    if (heroTitle !== undefined)    update.heroTitle    = String(heroTitle).slice(0, 200);
    if (heroSubtitle !== undefined) update.heroSubtitle = String(heroSubtitle).slice(0, 400);
    if (heroSpotlights !== undefined) {
      if (!Array.isArray(heroSpotlights)) return res.status(400).json({ message: "heroSpotlights doit être un tableau." });
      update.heroSpotlights = heroSpotlights.slice(0, 5);
    }

    const doc = await SiteContent.findByIdAndUpdate("hero", update, { new: true, upsert: true });
    res.json({ success: true, heroTitle: doc.heroTitle, heroSubtitle: doc.heroSubtitle, heroSpotlights: doc.heroSpotlights });
  } catch (err) {
    logger.error("updateHero:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
