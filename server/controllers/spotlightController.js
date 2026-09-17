// ── Vitrines de mise en avant ──────────────────────────────────────────────
// Un seul point d'entrée public pour tous les emplacements : carrousel du hero,
// véhicules en vedette, activités et loisirs, partenaires. L'interface ne
// décide plus de ce qui mérite d'être montré — elle demande un emplacement, et
// le moteur répond.
import logger from "../utils/logger.js";
import { vitrineEnCache, EMPLACEMENTS } from "../services/spotlightEngine.js";
import SpotlightRules from "../models/SpotlightRules.js";
import { chargerRegles, REGLE_PAR_DEFAUT } from "../services/spotlightRules.js";
import { cacheClear } from "../utils/catalogCache.js";

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
    // eslint-disable-next-line no-unused-vars -- `ids` sert au cache, pas à la réponse
    const { ids, ...vitrine } = await vitrineEnCache(emplacement, { country, type });
    res.json(vitrine);
  } catch (err) {
    logger.error("getSpotlight:", err);
    res.status(500).json({ message: "Erreur composition de la vitrine.", error: err.message });
  }
};

// ── Règles par pays (administration) ───────────────────────────────────────
// GET /api/spotlight/regles — valeurs par défaut et surcharges par pays.
export const getSpotlightRules = async (req, res) => {
  try {
    res.json({ regles: await chargerRegles(), defautPlateforme: REGLE_PAR_DEFAUT, emplacements: Object.fromEntries(Object.entries(EMPLACEMENTS).map(([k, v]) => [k, { capacite: v.capacite, parPays: v.parPays }])) });
  } catch (err) {
    logger.error("getSpotlightRules:", err);
    res.status(500).json({ message: "Erreur lecture des règles." });
  }
};

// PUT /api/spotlight/regles { defaut: {maxParPartenaire, seuilPartenaires}, parPays: [{country, …}] }
export const updateSpotlightRules = async (req, res) => {
  try {
    const entier = (v, min, max, repli) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : repli; };
    const defaut = {
      maxParPartenaire: entier(req.body?.defaut?.maxParPartenaire, 1, 20, REGLE_PAR_DEFAUT.maxParPartenaire),
      seuilPartenaires: entier(req.body?.defaut?.seuilPartenaires, 1, 1000, REGLE_PAR_DEFAUT.seuilPartenaires),
    };
    const vus = new Set();
    const parPays = (Array.isArray(req.body?.parPays) ? req.body.parPays : [])
      .filter((p) => /^[A-Za-z]{2}$/.test(String(p?.country || "")))
      .map((p) => ({ country: String(p.country).toUpperCase(), maxParPartenaire: entier(p.maxParPartenaire, 1, 20, defaut.maxParPartenaire), seuilPartenaires: entier(p.seuilPartenaires, 1, 1000, defaut.seuilPartenaires) }))
      .filter((p) => !vus.has(p.country) && vus.add(p.country));
    await SpotlightRules.findByIdAndUpdate("regles", { defaut, parPays, updatedAt: new Date(), updatedBy: req.user?._id || null }, { upsert: true, new: true });
    // Les vitrines et la règle sont en cache : une modification doit se voir tout de suite.
    cacheClear();
    res.json({ regles: await chargerRegles() });
  } catch (err) {
    logger.error("updateSpotlightRules:", err);
    res.status(500).json({ message: "Erreur enregistrement des règles." });
  }
};
