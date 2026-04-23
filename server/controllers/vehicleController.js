import Vehicle from "../models/Vehicle.js";
import Notification from "../models/Notification.js";

// ══════════════════════════════════════════════════════════════════════════════
// MOTEUR DE VALIDATION AUTOMATIQUE DES ANNONCES
// Score sur 100 — décision : approved / pending / rejected
// ══════════════════════════════════════════════════════════════════════════════
const scoreAnnonce = (data) => {
  const errors   = [];
  const warnings = [];
  let score = 0;

  // ── 1. IDENTITÉ (20 pts) ──────────────────────────────────────────────────
  // Nom du contact
  if ((data.contactNom || "").trim().length >= 3) score += 7;
  else warnings.push("Nom du contact incomplet");

  // Téléphone
  const tel = (data.contactTel || data.telephone || "").replace(/[\s\-().+]/g, "");
  if (tel.length >= 8) score += 8;
  else errors.push("Numéro de téléphone manquant ou invalide");

  // Ville
  if ((data.ville || "").trim().length >= 2) score += 5;
  else errors.push("Ville de publication manquante");

  // ── 2. INFORMATIONS DU VÉHICULE (25 pts) ──────────────────────────────────
  const titleLen = (data.title || "").trim().length;
  if (titleLen >= 10) score += 8;
  else if (titleLen >= 5) { score += 4; warnings.push("Titre trop court (min. 10 caractères recommandés)"); }
  else errors.push("Titre manquant ou trop court (minimum 5 caractères)");

  if ((data.marque || "").trim().length >= 2) score += 6;
  else errors.push("Marque du véhicule manquante");

  if ((data.modele || "").trim().length >= 1) score += 6;
  else errors.push("Modèle du véhicule manquant");

  const year        = Number(data.annee);
  const currentYear = new Date().getFullYear();
  if (year >= 1990 && year <= currentYear + 1) score += 3;
  else warnings.push("Année du véhicule absente ou invalide");

  if (data.etat) score += 2;

  // ── 3. CARACTÉRISTIQUES TECHNIQUES (20 pts) ───────────────────────────────
  if (data.vehicleType)  score += 4; else warnings.push("Catégorie du véhicule non spécifiée");
  if (data.carburant)    score += 4; else warnings.push("Type de carburant non spécifié");
  if (data.transmission) score += 4; else warnings.push("Transmission non précisée");

  const seats = Number(data.nombrePlaces);
  if (seats >= 1 && seats <= 20) score += 4;
  else warnings.push("Nombre de places invalide");

  if ((data.couleur || "").trim().length >= 2) score += 4;

  // ── 4. TARIFICATION (15 pts) ──────────────────────────────────────────────
  const price = Number(data.pricePerDay || data.priceForSale || 0);
  if (price >= 1000) {
    score += 12;
    if (data.pricePerDay  > 1_500_000) warnings.push("Tarif journalier très élevé — vérifiez le montant");
    if (data.priceForSale > 300_000_000) warnings.push("Prix de vente très élevé — vérifiez le montant");
  } else {
    errors.push("Prix manquant ou invalide (minimum 1 000 FCFA)");
  }
  if (Number(data.caution) > 0) score += 3;

  // ── 5. DESCRIPTION (15 pts) ───────────────────────────────────────────────
  const descLen = (data.description || "").trim().length;
  if (descLen >= 100)      score += 15;
  else if (descLen >= 50)  { score += 10; warnings.push("Description courte — décrivez davantage votre véhicule"); }
  else if (descLen >= 10)  { score += 5;  warnings.push("Description trop courte (50 caractères minimum recommandés)"); }
  else warnings.push("Ajoutez une description (50 caractères min. recommandés pour un meilleur score)");

  // ── 6. PHOTOS ─────────────────────────────────────────────────────────────
  const photoCount = (data.images || []).filter(Boolean).length;
  if (photoCount === 0) {
    score -= 10; // Pénalité forte
    errors.push("Aucune photo — au moins 1 photo est requise pour valider l'annonce");
  } else if (photoCount >= 3) {
    score += 5; // Bonus qualité
  }

  // Normaliser le score
  score = Math.max(0, Math.min(100, score));

  // ── DÉCISION AUTOMATIQUE ──────────────────────────────────────────────────
  // Erreurs critiques bloquant la publication immédiate
  const criticalErrors = errors.filter((e) =>
    e.includes("Téléphone") ||
    e.includes("Prix") ||
    e.includes("photo") ||
    e.includes("Marque") ||
    e.includes("Modèle")
  );

  let status;
  if (criticalErrors.length === 0 && score >= 65) {
    status = "approved"; // Auto-approuvé ✅
  } else if (criticalErrors.length >= 2 || score < 30) {
    status = "rejected"; // Auto-rejeté ❌
  } else {
    status = "pending";  // Examen manuel requis ⏳
  }

  return { score, status, errors, warnings };
};

// ── Créer une annonce véhicule (partenaire) ───────────────────────────────────
export const createVehicle = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    // ── Validation automatique ──────────────────────────────────────────────
    const validation = scoreAnnonce(req.body);

    const vehicle = await Vehicle.create({
      ...req.body,
      owner:              req.user._id,
      userId:             req.user._id.toString(),
      status:             validation.status,
      available:          validation.status === "approved",
      validationScore:    validation.score,
      validationErrors:   validation.errors,
      validationWarnings: validation.warnings,
      autoValidated:      true,
      rejectionReason:    validation.status === "rejected"
        ? validation.errors.join(". ")
        : null,
    });

    // ── Notification contextuelle (non bloquante) ────────────────────────────
    try {
      const notifMap = {
        approved: {
          type:    "listing_approved",
          titre:   "✅ Annonce approuvée et publiée !",
          message: `Votre annonce "${vehicle.title}" est maintenant visible dans le catalogue. Score : ${validation.score}/100.`,
        },
        rejected: {
          type:    "listing_rejected",
          titre:   "❌ Annonce non conforme",
          message: `Votre annonce "${vehicle.title}" a été rejetée. Problèmes : ${validation.errors.slice(0, 2).join(", ")}.`,
        },
        pending: {
          type:    "system",
          titre:   "⏳ Annonce en cours d'examen",
          message: `Votre annonce "${vehicle.title}" est en cours de vérification. Score actuel : ${validation.score}/100.`,
        },
      };
      await Notification.create({ user: req.user._id, lien: "/vendor/dashboard", ...notifMap[validation.status] });
    } catch (notifErr) {
      console.error("Notification (non bloquant) :", notifErr.message);
    }

    res.status(201).json({ vehicle, validation });
  } catch (err) {
    console.error("createVehicle:", err);
    res.status(400).json({ message: "Erreur création véhicule." });
  }
};

// ── Tous les véhicules approuvés (public) ─────────────────────────────────────
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

// ── Mes annonces (partenaire connecté) ────────────────────────────────────────
export const getMyVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ vehicles });
  } catch (err) {
    console.error("getMyVehicles:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Annonces en attente (admin) ───────────────────────────────────────────────
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

// ── Approuver / rejeter une annonce (admin) ───────────────────────────────────
export const updateVehicleStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      {
        status,
        rejectionReason: rejectionReason || null,
        available: status === "approved",
      },
      { new: true }
    ).populate("owner", "_id firstName");

    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    await Notification.create({
      user:    vehicle.owner._id,
      type:    status === "approved" ? "listing_approved" : "listing_rejected",
      titre:   status === "approved" ? "Annonce approuvée ✅" : "Annonce rejetée ❌",
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

// ── Modifier une annonce (propriétaire ou admin) ──────────────────────────────
export const updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    // Si un partenaire modifie, re-valider et changer le statut
    if (isOwner && req.user.role !== "admin") {
      const validation = scoreAnnonce({ ...vehicle.toObject(), ...req.body });
      req.body.status             = validation.status;
      req.body.available          = validation.status === "approved";
      req.body.validationScore    = validation.score;
      req.body.validationErrors   = validation.errors;
      req.body.validationWarnings = validation.warnings;
      req.body.rejectionReason    = validation.status === "rejected"
        ? validation.errors.join(". ")
        : null;
    }

    const updated = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ vehicle: updated });
  } catch (err) {
    console.error("updateVehicle:", err);
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

// ── Supprimer une annonce (propriétaire ou admin) ─────────────────────────────
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
