import Ad from "../models/Ad.js";

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

export const createAd = async (req, res) => {
  try {
    const ad = await Ad.create({ ...req.body, createdBy: req.user.id });
    res.status(201).json(ad);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const updateAd = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!ad) return res.status(404).json({ message: "Annonce introuvable." });
    res.json(ad);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const deleteAd = async (req, res) => {
  try {
    await Ad.findByIdAndDelete(req.params.id);
    res.json({ message: "Annonce supprimée." });
  } catch {
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
