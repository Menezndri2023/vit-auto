import Vehicle from "../models/Vehicle.js";
import Notification from "../models/Notification.js";

// ── Créer une annonce véhicule (partenaire) ───────────────────────────────
export const createVehicle = async (req, res) => {
  try {
    // Seuls les partenaires et admins peuvent publier
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    const vehicle = await Vehicle.create({
      ...req.body,
      owner: req.user._id,
      status: req.user.role === "admin" ? "approved" : "pending",
    });

    // Notifier les admins (simplification : notif stockée pour le partenaire lui-même)
    await Notification.create({
      user: req.user._id,
      type: "system",
      titre: "Annonce soumise",
      message: "Votre annonce est en cours de vérification. Vous serez notifié une fois approuvée.",
      lien: "/vendor/dashboard",
    });

    res.status(201).json({ vehicle });
  } catch (err) {
    console.error("createVehicle:", err);
    res.status(400).json({ message: "Erreur création véhicule." });
  }
};

// ── Tous les véhicules approuvés (public) ─────────────────────────────────
export const getVehicles = async (req, res) => {
  try {
    const { type, ville, carburant, transmission, minPrice, maxPrice } = req.query;
    const filter = { status: "approved", available: true };

    if (type)         filter.type = type;
    if (ville)        filter.ville = new RegExp(ville, "i");
    if (carburant)    filter.carburant = carburant;
    if (transmission) filter.transmission = transmission;
    if (minPrice || maxPrice) {
      filter.pricePerDay = {};
      if (minPrice) filter.pricePerDay.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
    }

    const vehicles = await Vehicle.find(filter)
      .sort({ createdAt: -1 })
      .populate("owner", "firstName phone ville");

    res.json(vehicles);
  } catch (err) {
    console.error("getVehicles:", err);
    res.status(500).json({ message: "Erreur récupération véhicules." });
  }
};

// ── Mes annonces (partenaire connecté) ────────────────────────────────────
export const getMyVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ vehicles });
  } catch (err) {
    console.error("getMyVehicles:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Annonces en attente (admin) ───────────────────────────────────────────
export const getPendingVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .populate("owner", "firstName lastName email phone");
    res.json({ vehicles });
  } catch (err) {
    console.error("getPendingVehicles:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Approuver / rejeter une annonce (admin) ───────────────────────────────
export const updateVehicleStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { status, rejectionReason: rejectionReason || null },
      { new: true }
    ).populate("owner", "_id firstName");

    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    // Notifier le partenaire
    await Notification.create({
      user: vehicle.owner._id,
      type: status === "approved" ? "listing_approved" : "listing_rejected",
      titre: status === "approved" ? "Annonce approuvée ✅" : "Annonce rejetée ❌",
      message: status === "approved"
        ? `Votre annonce "${vehicle.title}" est maintenant en ligne.`
        : `Votre annonce "${vehicle.title}" a été rejetée. ${rejectionReason || ""}`,
      lien: "/vendor/dashboard",
    });

    res.json({ vehicle });
  } catch (err) {
    console.error("updateVehicleStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

// ── Modifier une annonce (propriétaire ou admin) ──────────────────────────
export const updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    // Si un partenaire modifie, repasser en "pending"
    if (isOwner && req.user.role !== "admin") {
      req.body.status = "pending";
    }

    const updated = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ vehicle: updated });
  } catch (err) {
    console.error("updateVehicle:", err);
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

// ── Supprimer une annonce (propriétaire ou admin) ─────────────────────────
export const deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await vehicle.deleteOne();
    res.json({ message: "Annonce supprimée." });
  } catch (err) {
    console.error("deleteVehicle:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};
