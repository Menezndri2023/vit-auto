import logger from "../utils/logger.js";
import Ad from "../models/Ad.js";
import { nonBloquant } from "../utils/nonBloquant.js";

export const getAds = async (req, res) => {
  try {
    const { position } = req.query;
    const filter = { active: true };
    if (position) filter.position = position;

    const now = new Date();

    // Fix: deux $or distincts → utiliser $and pour combiner
    const ads = await Ad.find({
      ...filter,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate:   null }, { endDate:   { $gte: now } }] },
      ],
    }).sort({ priority: -1 }).limit(10);

    // Comptabilise une impression par annonce effectivement renvoyée au
    // visiteur — best-effort, ne doit jamais bloquer/retarder la réponse.
    if (ads.length) {
      Ad.updateMany({ _id: { $in: ads.map((a) => a._id) } }, { $inc: { views: 1 } }).catch(nonBloquant("adsController"));
    }

    res.json(ads);
  } catch {
    res.status(500).json({ message: "Erreur récupération annonces." });
  }
};

export const getAllAds = async (_req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 });
    res.json(ads);
  } catch {
    res.status(500).json({ message: "Erreur." });
  }
};

// Liste blanche des champs modifiables depuis une requête. Seule affectation
// en masse du projet : `findByIdAndUpdate(id, req.body)` recopiait le corps
// entier, permettant d'écrire des champs qui ne relèvent pas de la saisie —
// `createdBy` (attribution de la publicité à quelqu'un d'autre) et les
// compteurs `clicks`/`views`, qui deviennent alors des statistiques
// falsifiables. Mongoose `strict` bloque les champs hors schéma, jamais les
// champs internes du schéma lui-même.
const AD_EDITABLE_FIELDS = ["title", "description", "image", "link", "linkLabel", "position", "active", "priority"];

const pickAdFields = (body = {}) => {
  const out = {};
  for (const key of AD_EDITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

export const createAd = async (req, res) => {
  try {
    const ad = await Ad.create({ ...pickAdFields(req.body), createdBy: req.user.id });
    res.status(201).json(ad);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const updateAd = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(req.params.id, pickAdFields(req.body), { new: true });
    if (!ad) return res.status(404).json({ message: "Annonce introuvable." });
    res.json(ad);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const deleteAd = async (req, res) => {
  try {
    // Le résultat était ignoré : supprimer un id inexistant (ligne déjà
    // supprimée dans un autre onglet) répondait 200 « Annonce supprimée »,
    // faisant croire à une suppression qui n'a jamais eu lieu.
    const deleted = await Ad.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Publicité introuvable." });
    res.json({ message: "Annonce supprimée." });
  } catch (err) {
    logger.error("deleteAd:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

export const trackAdClick = async (req, res) => {
  try {
    await Ad.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: "Erreur." });
  }
};
