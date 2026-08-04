import logger from "../utils/logger.js";
import SiteContent from "../models/SiteContent.js";

const SPOTLIGHT_POPULATE = "title images image pricePerDay buyPrice priceForSale listingType mode ville marque modele type country";

// ── GET /api/site-content/hero — public ──────────────────────────────────────
// Renvoie la sélection globale ET la sélection par pays (voir SiteContent.js)
// — HeroSection.jsx choisit la liste à afficher selon le pays détecté du
// visiteur, l'admin (MarketingSection) a besoin de tout voir pour éditer
// n'importe quel pays sans requête supplémentaire.
export const getHero = async (req, res) => {
  try {
    const doc = await SiteContent.findById("hero")
      .populate("heroSpotlights", SPOTLIGHT_POPULATE)
      .populate("heroSpotlightsByCountry.vehicles", SPOTLIGHT_POPULATE)
      .lean();
    res.json({
      heroTitle:               doc?.heroTitle || "",
      heroSubtitle:            doc?.heroSubtitle || "",
      heroSpotlights:          doc?.heroSpotlights || [],
      heroSpotlightsByCountry: doc?.heroSpotlightsByCountry || [],
    });
  } catch (err) {
    logger.error("getHero:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/site-content/hero — admin ─────────────────────────────────────
// `country` absent/null/"GLOBAL" : édite la sélection par défaut
// (heroSpotlights). `country` = code ISO-2 : édite/crée l'entrée
// correspondante dans heroSpotlightsByCountry (upsert dans le tableau, un seul
// $set atomique — jamais deux requêtes qui pourraient se chevaucher entre
// admins simultanés).
export const updateHero = async (req, res) => {
  try {
    const { heroTitle, heroSubtitle, heroSpotlights, country } = req.body;
    const isCountryScoped = country && country !== "GLOBAL";

    if (heroSpotlights !== undefined && !Array.isArray(heroSpotlights)) {
      return res.status(400).json({ message: "heroSpotlights doit être un tableau." });
    }

    const update = { updatedAt: new Date(), updatedBy: req.user.id };
    if (heroTitle !== undefined)    update.heroTitle    = String(heroTitle).slice(0, 200);
    if (heroSubtitle !== undefined) update.heroSubtitle = String(heroSubtitle).slice(0, 400);

    if (heroSpotlights !== undefined && !isCountryScoped) {
      update.heroSpotlights = heroSpotlights.slice(0, 5);
    }

    // S'assurer que le document existe avant un éventuel upsert dans le
    // sous-tableau par pays (findOneAndUpdate avec $ positionnel n'upsert pas
    // un élément de tableau, seulement le document racine).
    await SiteContent.findByIdAndUpdate("hero", {}, { upsert: true });

    if (heroSpotlights !== undefined && isCountryScoped) {
      const code = String(country).toUpperCase().slice(0, 2);
      const vehicles = heroSpotlights.slice(0, 5);
      const existing = await SiteContent.findOne({ _id: "hero", "heroSpotlightsByCountry.country": code }).select("_id").lean();
      if (existing) {
        await SiteContent.updateOne(
          { _id: "hero", "heroSpotlightsByCountry.country": code },
          { $set: { "heroSpotlightsByCountry.$.vehicles": vehicles, ...update } }
        );
      } else {
        await SiteContent.updateOne(
          { _id: "hero" },
          { $push: { heroSpotlightsByCountry: { country: code, vehicles } }, $set: update }
        );
      }
    } else {
      await SiteContent.findByIdAndUpdate("hero", update);
    }

    const doc = await SiteContent.findById("hero")
      .populate("heroSpotlights", SPOTLIGHT_POPULATE)
      .populate("heroSpotlightsByCountry.vehicles", SPOTLIGHT_POPULATE)
      .lean();
    res.json({
      success: true,
      heroTitle:               doc.heroTitle,
      heroSubtitle:            doc.heroSubtitle,
      heroSpotlights:          doc.heroSpotlights,
      heroSpotlightsByCountry: doc.heroSpotlightsByCountry,
    });
  } catch (err) {
    logger.error("updateHero:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
