// ── Vitrines de mise en avant ──────────────────────────────────────────────
// Un seul point d'entrée public pour tous les emplacements : carrousel du hero,
// véhicules en vedette, activités et loisirs, partenaires. L'interface ne
// décide plus de ce qui mérite d'être montré — elle demande un emplacement, et
// le moteur répond.
import logger from "../utils/logger.js";
import { vitrineEnCache, EMPLACEMENTS } from "../services/spotlightEngine.js";

// GET /api/spotlight/:emplacement?country=CI&type=location
export const getSpotlight = async (req, res) => {
  try {
    const { emplacement } = req.params;
    if (!EMPLACEMENTS[emplacement]) {
      return res.status(400).json({
        message: `Emplacement inconnu. Attendu : ${Object.keys(EMPLACEMENTS).join(", ")}.`,
      });
    }
    // Le pays vient de la position du visiteur, résolue côté interface
    // (VehicleContext.catalogCountry). Normalisé et borné : une valeur libre
    // arrivant en clé de cache permettrait d'en créer autant qu'on veut.
    const country = /^[A-Za-z]{2}$/.test(String(req.query.country || "")) && req.query.country !== "INTL"
      ? String(req.query.country).toUpperCase()
      : null;
    const type = ["location", "vente", "essai", "leasing"].includes(String(req.query.type))
      ? String(req.query.type)
      : null;

    // `ids` (ObjectId bruts) ne sert qu'au filtre interne du catalogue : chaque
    // item porte déjà son identifiant en chaîne. L'exposer publierait deux
    // représentations du même champ, dont une que le client ne saurait pas lire.
    const { ids, ...vitrine } = await vitrineEnCache(emplacement, { country, type });
    res.json(vitrine);
  } catch (err) {
    logger.error("getSpotlight:", err);
    res.status(500).json({ message: "Erreur composition de la vitrine.", error: err.message });
  }
};
