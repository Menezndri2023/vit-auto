import mongoose from "mongoose";
import logger from "../utils/logger.js";
import Favorite from "../models/Favorite.js";
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { limitVehicleImages } from "../services/vehicleScoring.js";

const ITEM_TYPES = ["vehicle", "ie_listing"];

// ── GET /api/favorites ─────────────────────────────────────────────────────
// Renvoie les favoris de l'utilisateur avec l'item complet (véhicule ou
// annonce IE) déjà résolu — évite un aller-retour supplémentaire côté client
// pour chaque favori (comme pour les autres listes du site, voir Catalogue).
export const getFavorites = async (req, res) => {
  try {
    const favs = await Favorite.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
    const vehicleIds = favs.filter((f) => f.itemType === "vehicle").map((f) => f.itemId);
    const listingIds = favs.filter((f) => f.itemType === "ie_listing").map((f) => f.itemId);

    const [vehicles, listings] = await Promise.all([
      vehicleIds.length ? Vehicle.find({ _id: { $in: vehicleIds } }).lean() : [],
      listingIds.length ? ImportExportListing.find({ _id: { $in: listingIds } }).lean() : [],
    ]);
    const vehicleMap = new Map(vehicles.map((v) => [String(v._id), limitVehicleImages(v)]));
    const listingMap = new Map(listings.map((l) => [String(l._id), limitVehicleImages(l)]));

    const items = favs
      .map((f) => {
        const item = f.itemType === "vehicle" ? vehicleMap.get(String(f.itemId)) : listingMap.get(String(f.itemId));
        if (!item) return null; // item supprimé depuis — favori orphelin, silencieusement ignoré
        return { favoriteId: f._id, itemType: f.itemType, addedAt: f.createdAt, item };
      })
      .filter(Boolean);

    res.json({ favorites: items });
  } catch (err) {
    logger.error("getFavorites:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/favorites/ids ──────────────────────────────────────────────────
// Liste légère (juste les itemId) pour afficher le cœur "rempli" sur chaque
// carte du catalogue sans charger tous les documents complets.
export const getFavoriteIds = async (req, res) => {
  try {
    const favs = await Favorite.find({ user: req.user.id }).select("itemType itemId").lean();
    res.json({ ids: favs.map((f) => `${f.itemType}:${f.itemId}`) });
  } catch (err) {
    logger.error("getFavoriteIds:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/favorites ─────────────────────────────────────────────────────
export const addFavorite = async (req, res) => {
  try {
    const { itemType, itemId } = req.body;
    if (!ITEM_TYPES.includes(itemType) || !itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: "itemType et itemId (valide) requis." });
    }
    const Model = itemType === "vehicle" ? Vehicle : ImportExportListing;
    const exists = await Model.exists({ _id: itemId });
    if (!exists) return res.status(404).json({ message: "Annonce introuvable." });

    await Favorite.create({ user: req.user.id, itemType, itemId });
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.code === 11000) return res.status(200).json({ success: true }); // déjà en favoris — idempotent
    logger.error("addFavorite:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── DELETE /api/favorites/:itemType/:itemId ────────────────────────────────
export const removeFavorite = async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    if (!ITEM_TYPES.includes(itemType)) return res.status(400).json({ message: "itemType invalide." });
    await Favorite.deleteOne({ user: req.user.id, itemType, itemId });
    res.json({ success: true });
  } catch (err) {
    logger.error("removeFavorite:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
