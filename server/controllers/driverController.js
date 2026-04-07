import Driver from "../models/Driver.js";
import Notification from "../models/Notification.js";

// ── Créer un profil chauffeur (partenaire) ────────────────────────────────
export const createDriver = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    const driver = await Driver.create({
      ...req.body,
      owner: req.user._id,
      status: req.user.role === "admin" ? "approved" : "pending",
    });

    await Notification.create({
      user: req.user._id,
      type: "system",
      titre: "Profil chauffeur soumis",
      message: "Votre profil chauffeur est en cours de vérification.",
      lien: "/vendor/dashboard",
    });

    res.status(201).json({ driver });
  } catch (err) {
    console.error("createDriver:", err);
    res.status(400).json({ message: "Erreur création chauffeur." });
  }
};

// ── Tous les chauffeurs approuvés (public) ────────────────────────────────
export const getDrivers = async (req, res) => {
  try {
    const { zone, disponibilite } = req.query;
    const filter = { status: "approved" };
    if (zone)         filter.zone = new RegExp(zone, "i");
    if (disponibilite) filter.disponibilite = disponibilite;

    const drivers = await Driver.find(filter)
      .sort({ noteMoyenne: -1, createdAt: -1 })
      .populate("owner", "firstName phone");

    res.json(drivers);
  } catch (err) {
    console.error("getDrivers:", err);
    res.status(500).json({ message: "Erreur récupération chauffeurs." });
  }
};

// ── Mes profils chauffeur (partenaire) ────────────────────────────────────
export const getMyDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ drivers });
  } catch (err) {
    console.error("getMyDrivers:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Chauffeurs en attente (admin) ─────────────────────────────────────────
export const getPendingDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .populate("owner", "firstName lastName email");
    res.json({ drivers });
  } catch (err) {
    console.error("getPendingDrivers:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Approuver / rejeter un chauffeur (admin) ──────────────────────────────
export const updateDriverStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { status, rejectionReason: rejectionReason || null },
      { new: true }
    ).populate("owner", "_id firstName");

    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    await Notification.create({
      user: driver.owner._id,
      type: status === "approved" ? "listing_approved" : "listing_rejected",
      titre: status === "approved" ? "Profil chauffeur approuvé ✅" : "Profil chauffeur rejeté ❌",
      message: status === "approved"
        ? `Votre profil "${driver.title}" est maintenant visible.`
        : `Votre profil "${driver.title}" a été rejeté. ${rejectionReason || ""}`,
      lien: "/vendor/dashboard",
    });

    res.json({ driver });
  } catch (err) {
    console.error("updateDriverStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

// ── Supprimer un profil (propriétaire ou admin) ───────────────────────────
export const deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await driver.deleteOne();
    res.json({ message: "Profil supprimé." });
  } catch (err) {
    console.error("deleteDriver:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};
