import logger from "../utils/logger.js";
import ImportExportRequest     from "../models/ImportExportRequest.js";
import ImporterPartnerProfile  from "../models/ImporterPartnerProfile.js";
import ImportExportListing     from "../models/ImportExportListing.js";
import User                    from "../models/User.js";
import Notification            from "../models/Notification.js";

// ─────────────────────────────────────────────────────────────────────────────
// DEMANDES CLIENT (import/export requests)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/import-export/requests  — public, pas besoin d'être connecté
export const createRequest = async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone,
      serviceType, pack,
      sourceCountry, destCountry,
      vehicleType, vehicleMake, vehicleModel, vehicleYear,
      budget, currency, message,
    } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ message: "Prénom, nom et email sont requis." });
    }

    const request = await ImportExportRequest.create({
      firstName, lastName, email, phone,
      userId: req.user?._id || null,
      serviceType: serviceType || "import",
      pack: pack || "Silver",
      sourceCountry, destCountry,
      vehicleType, vehicleMake, vehicleModel, vehicleYear,
      budget: budget ? Number(budget) : undefined,
      currency: currency || "EUR",
      message,
    });

    // Notifier les admins
    const admins = await User.find({ role: "admin" }).select("_id");
    if (admins.length > 0) {
      await Notification.insertMany(admins.map((a) => ({
        user: a._id,
        type: "ie_request",
        titre: "Nouvelle demande Import/Export",
        message: `${firstName} ${lastName} — Pack ${pack || "Silver"} — ${sourceCountry || "?"} → ${destCountry || "?"}`,
        lien: "/admin",
      })));
    }

    res.status(201).json({ message: "Demande envoyée avec succès.", request });
  } catch (err) {
    logger.error("createRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/requests  — admin only
export const getRequests = async (req, res) => {
  try {
    const { status, limit = 100, page = 1 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const safePage  = Math.max(Number(page), 1);
    const filter = {};
    if (status) filter.status = status;

    const [requests, total] = await Promise.all([
      ImportExportRequest.find(filter)
        .populate("userId", "firstName lastName email profilePhoto")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      ImportExportRequest.countDocuments(filter),
    ]);

    res.json({ requests, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getRequests:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/import-export/requests/:id/status  — admin only
export const updateRequestStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const allowed = ["pending", "processing", "approved", "rejected", "contacted"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const request = await ImportExportRequest.findByIdAndUpdate(
      req.params.id,
      { status, adminNote: adminNote || null, handledBy: req.user._id, handledAt: new Date() },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: "Demande introuvable." });

    // Notifier le demandeur s'il a un compte
    if (request.userId) {
      const labels = {
        processing: "votre demande est en cours de traitement",
        approved:   "votre demande Import/Export a été validée",
        rejected:   "votre demande Import/Export a été refusée",
        contacted:  "notre équipe vous a contacté",
      };
      if (labels[status]) {
        await Notification.create({
          user:    request.userId,
          type:    status === "rejected" ? "error" : "success",
          titre:   "Import / Export",
          message: `Bonjour ${request.firstName}, ${labels[status]}.${adminNote ? " Note : " + adminNote : ""}`,
          lien:    "/import-export",
        });
      }
    }

    res.json({ request });
  } catch (err) {
    logger.error("updateRequestStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// DELETE /api/import-export/requests/:id  — admin only
export const deleteRequest = async (req, res) => {
  try {
    await ImportExportRequest.findByIdAndDelete(req.params.id);
    res.json({ message: "Demande supprimée." });
  } catch (err) {
    logger.error("deleteRequest:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PROFIL PARTENAIRE IMPORTATEUR
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/import-export/importer-profile  — partenaire connecté (son propre profil)
export const getMyImporterProfile = async (req, res) => {
  try {
    const profile = await ImporterPartnerProfile.findOne({ userId: req.user._id });
    res.json({ profile: profile || null });
  } catch (err) {
    logger.error("getMyImporterProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/import-export/importer-profile  — partenaire soumet sa candidature
export const submitImporterProfile = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    const {
      companyName, rccm, taxId, operatingLicense,
      address, city, country, website,
      documents,
      activityType, operatingCountries, vehicleCategories,
      annualVolume, yearsExperience,
      references, description,
    } = req.body;

    if (!companyName) {
      return res.status(400).json({ message: "Nom de l'entreprise requis." });
    }

    const existing = await ImporterPartnerProfile.findOne({ userId: req.user._id });

    if (existing) {
      // Mise à jour — ne peut re-soumettre que si rejeté ou not_submitted
      if (!["not_submitted", "rejected"].includes(existing.status)) {
        return res.status(409).json({ message: "Une candidature est déjà en cours ou validée." });
      }
      Object.assign(existing, {
        companyName, rccm, taxId, operatingLicense,
        address, city, country, website,
        documents: { ...existing.documents, ...documents },
        activityType: activityType || existing.activityType,
        operatingCountries: operatingCountries || existing.operatingCountries,
        vehicleCategories: vehicleCategories || existing.vehicleCategories,
        annualVolume, yearsExperience,
        references, description,
        status: "pending",
        submittedAt: new Date(),
        rejectionReason: null,
      });
      await existing.save();

      // Notifier admins
      const admins = await User.find({ role: "admin" }).select("_id");
      await Notification.insertMany(admins.map((a) => ({
        user:    a._id,
        type:    "ie_profile",
        titre:   "Candidature importateur re-soumise",
        message: `${req.user.firstName} ${req.user.lastName} a re-soumis sa candidature importateur.`,
        lien:    "/admin",
      })));

      return res.json({ message: "Candidature mise à jour.", profile: existing });
    }

    const profile = await ImporterPartnerProfile.create({
      userId: req.user._id,
      companyName, rccm, taxId, operatingLicense,
      address, city, country, website,
      documents: documents || {},
      activityType: activityType || ["import"],
      operatingCountries: operatingCountries || [],
      vehicleCategories: vehicleCategories || [],
      annualVolume, yearsExperience: yearsExperience || 0,
      references, description,
      status: "pending",
      submittedAt: new Date(),
    });

    // Notifier admins
    const admins = await User.find({ role: "admin" }).select("_id");
    await Notification.insertMany(admins.map((a) => ({
      user:    a._id,
      type:    "ie_profile",
      titre:   "Nouvelle candidature importateur",
      message: `${req.user.firstName} ${req.user.lastName} (${companyName}) a soumis sa candidature.`,
      lien:    "/admin",
    })));

    res.status(201).json({ message: "Candidature soumise avec succès.", profile });
  } catch (err) {
    logger.error("submitImporterProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/importer-profiles  — admin : liste toutes les candidatures
export const getImporterProfiles = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const safePage  = Math.max(Number(page), 1);
    const filter = {};
    if (status) filter.status = status;

    const [profiles, total] = await Promise.all([
      ImporterPartnerProfile.find(filter)
        .populate("userId", "firstName lastName email phone profilePhoto role business")
        .populate("reviewedBy", "firstName lastName")
        .sort({ submittedAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      ImporterPartnerProfile.countDocuments(filter),
    ]);

    res.json({ profiles, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getImporterProfiles:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/import-export/importer-profiles/:id/review  — admin valide/rejette
export const reviewImporterProfile = async (req, res) => {
  try {
    const { status, rejectionReason, badgeLevel } = req.body;
    const allowed = ["verified", "rejected", "suspended"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const profile = await ImporterPartnerProfile.findByIdAndUpdate(
      req.params.id,
      {
        status,
        rejectionReason: status === "rejected" ? rejectionReason : null,
        badgeLevel: status === "verified" ? (badgeLevel || "silver") : "none",
        reviewedAt: new Date(),
        reviewedBy: req.user._id,
      },
      { new: true }
    ).populate("userId", "firstName lastName email");

    if (!profile) return res.status(404).json({ message: "Profil introuvable." });

    // Mettre à jour importerStatus sur l'User
    await User.findByIdAndUpdate(profile.userId._id, {
      "importerProfile.status": status,
      "importerProfile.badgeLevel": status === "verified" ? (badgeLevel || "silver") : "none",
      "importerProfile.profileId": profile._id,
    });

    // Notifier le partenaire
    await Notification.create({
      user:    profile.userId._id,
      type:    status === "verified" ? "success" : "error",
      titre:   status === "verified" ? "Candidature importateur approuvée !" : "Candidature importateur refusée",
      message: status === "verified"
        ? "Félicitations ! Votre profil importateur a été vérifié. Vous pouvez maintenant publier des annonces import/export."
        : `Votre candidature a été refusée.${rejectionReason ? " Motif : " + rejectionReason : ""}`,
      lien:    "/importer-dashboard",
    });

    res.json({ profile });
  } catch (err) {
    logger.error("reviewImporterProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/importer-profiles/:id  — détail d'un profil (admin)
export const getImporterProfileById = async (req, res) => {
  try {
    const profile = await ImporterPartnerProfile.findById(req.params.id)
      .populate("userId", "firstName lastName email phone profilePhoto role business identity");
    if (!profile) return res.status(404).json({ message: "Profil introuvable." });
    res.json({ profile });
  } catch (err) {
    logger.error("getImporterProfileById:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ANNONCES IMPORT/EXPORT (listings)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/import-export/listings  — public
export const getListings = async (req, res) => {
  try {
    const { sourceCountry, status = "approved", page = 1, limit = 20, partner } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const safePage  = Math.max(Number(page), 1);
    const filter = { status };
    if (sourceCountry) {
      const escaped = sourceCountry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.sourceCountry = new RegExp(escaped.slice(0, 100), "i");
    }
    if (partner)       filter.partner = partner;

    const [listings, total] = await Promise.all([
      ImportExportListing.find(filter)
        .populate("partner", "firstName lastName profilePhoto business")
        .populate("importerProfile", "companyName badgeLevel")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      ImportExportListing.countDocuments(filter),
    ]);

    res.json({ listings, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getListings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/listings/mine  — partenaire : ses propres annonces
export const getMyListings = async (req, res) => {
  try {
    const listings = await ImportExportListing.find({ partner: req.user._id })
      .populate("importerProfile", "companyName badgeLevel status")
      .sort({ createdAt: -1 });
    res.json({ listings });
  } catch (err) {
    logger.error("getMyListings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/listings/:id  — détail
export const getListingById = async (req, res) => {
  try {
    const listing = await ImportExportListing.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).populate("partner", "firstName lastName profilePhoto business phone")
     .populate("importerProfile", "companyName badgeLevel operatingCountries");

    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });
    res.json({ listing });
  } catch (err) {
    logger.error("getListingById:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/import-export/listings  — partenaire importateur vérifié
export const createListing = async (req, res) => {
  try {
    const importerProfile = await ImporterPartnerProfile.findOne({ userId: req.user._id });
    if (!importerProfile || importerProfile.status !== "verified") {
      return res.status(403).json({
        message: "Seuls les importateurs vérifiés peuvent publier des annonces.",
      });
    }

    const {
      title, make, model, year, mileage, fuelType, transmission,
      bodyType, color, condition, description,
      sourceCountry, sourceCity, availableIn,
      price, currency, priceIncludes, negotiable, stockQty,
      photos, mainPhoto,
    } = req.body;

    if (!title || !make || !model || !year || !sourceCountry || !price) {
      return res.status(400).json({ message: "Champs obligatoires manquants." });
    }

    const listing = await ImportExportListing.create({
      partner: req.user._id,
      importerProfile: importerProfile._id,
      title, make, model, year: Number(year),
      mileage: Number(mileage) || 0,
      fuelType, transmission, bodyType, color,
      condition: condition || "occasion",
      description,
      sourceCountry, sourceCity,
      availableIn: availableIn || [],
      price: Number(price), currency: currency || "EUR",
      priceIncludes: priceIncludes || [],
      negotiable: !!negotiable,
      stockQty: Number(stockQty) || 1,
      photos: photos || [],
      mainPhoto: mainPhoto || (photos?.[0] || null),
      status: "pending",
    });

    // Notifier admins
    const admins = await User.find({ role: "admin" }).select("_id");
    await Notification.insertMany(admins.map((a) => ({
      user:    a._id,
      type:    "ie_listing",
      titre:   "Nouvelle annonce import/export",
      message: `${req.user.firstName} ${req.user.lastName} — ${title} (${sourceCountry})`,
      lien:    "/admin",
    })));

    res.status(201).json({ message: "Annonce soumise pour validation.", listing });
  } catch (err) {
    logger.error("createListing:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PUT /api/import-export/listings/:id  — partenaire modifie (si draft ou rejected)
export const updateListing = async (req, res) => {
  try {
    const listing = await ImportExportListing.findOne({
      _id: req.params.id,
      partner: req.user._id,
    });
    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });
    if (!["draft", "rejected"].includes(listing.status) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Annonce non modifiable dans ce statut." });
    }

    // Whitelist des champs modifiables par le partenaire (évite le mass assignment)
    const {
      title, make, model, year, mileage, fuelType, transmission,
      bodyType, color, condition, description,
      sourceCountry, sourceCity, availableIn,
      price, currency, priceIncludes, negotiable, stockQty,
      photos, mainPhoto,
    } = req.body;

    Object.assign(listing, {
      title, make, model, year: year ? Number(year) : listing.year,
      mileage: mileage !== undefined ? Number(mileage) : listing.mileage,
      fuelType, transmission, bodyType, color, condition, description,
      sourceCountry, sourceCity,
      availableIn: availableIn || listing.availableIn,
      price: price ? Number(price) : listing.price,
      currency: currency || listing.currency,
      priceIncludes: priceIncludes || listing.priceIncludes,
      negotiable: negotiable !== undefined ? !!negotiable : listing.negotiable,
      stockQty: stockQty ? Number(stockQty) : listing.stockQty,
      photos: photos || listing.photos,
      mainPhoto: mainPhoto || listing.mainPhoto,
      status: "pending",
      updatedAt: new Date(),
    });
    await listing.save();
    res.json({ listing });
  } catch (err) {
    logger.error("updateListing:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/import-export/listings/:id/status  — admin valide/rejette
export const updateListingStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const allowed = ["approved", "rejected", "archived"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const listing = await ImportExportListing.findByIdAndUpdate(
      req.params.id,
      {
        status,
        adminNote: adminNote || null,
        approvedBy: status === "approved" ? req.user._id : null,
        approvedAt: status === "approved" ? new Date() : null,
      },
      { new: true }
    ).populate("partner", "firstName lastName");

    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });

    // Notifier le partenaire
    await Notification.create({
      user:    listing.partner._id,
      type:    status === "approved" ? "success" : "error",
      titre:   status === "approved" ? "Annonce import/export publiée !" : "Annonce import/export refusée",
      message: status === "approved"
        ? `Votre annonce "${listing.title}" est maintenant publiée sur VIT AUTO.`
        : `Votre annonce "${listing.title}" a été refusée.${adminNote ? " Motif : " + adminNote : ""}`,
      lien:    "/importer-dashboard",
    });

    res.json({ listing });
  } catch (err) {
    logger.error("updateListingStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// DELETE /api/import-export/listings/:id  — partenaire ou admin
export const deleteListing = async (req, res) => {
  try {
    const filter = req.user.role === "admin"
      ? { _id: req.params.id }
      : { _id: req.params.id, partner: req.user._id };

    const listing = await ImportExportListing.findOneAndDelete(filter);
    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });
    res.json({ message: "Annonce supprimée." });
  } catch (err) {
    logger.error("deleteListing:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/listings/admin  — admin : toutes les annonces (tous statuts)
export const getAdminListings = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const safePage  = Math.max(Number(page), 1);
    const filter = {};
    if (status) filter.status = status;

    const [listings, total] = await Promise.all([
      ImportExportListing.find(filter)
        .populate("partner", "firstName lastName email profilePhoto")
        .populate("importerProfile", "companyName badgeLevel")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      ImportExportListing.countDocuments(filter),
    ]);

    res.json({ listings, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getAdminListings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STATS — admin dashboard
// ─────────────────────────────────────────────────────────────────────────────

export const getStats = async (req, res) => {
  try {
    const [
      totalRequests, pendingRequests, approvedRequests, rejectedRequests,
      totalProfiles, pendingProfiles, verifiedProfiles,
      totalListings, pendingListings, approvedListings,
    ] = await Promise.all([
      ImportExportRequest.countDocuments(),
      ImportExportRequest.countDocuments({ status: "pending" }),
      ImportExportRequest.countDocuments({ status: "approved" }),
      ImportExportRequest.countDocuments({ status: "rejected" }),
      ImporterPartnerProfile.countDocuments(),
      ImporterPartnerProfile.countDocuments({ status: "pending" }),
      ImporterPartnerProfile.countDocuments({ status: "verified" }),
      ImportExportListing.countDocuments(),
      ImportExportListing.countDocuments({ status: "pending" }),
      ImportExportListing.countDocuments({ status: "approved" }),
    ]);

    res.json({
      requests: { total: totalRequests, pending: pendingRequests, approved: approvedRequests, rejected: rejectedRequests },
      profiles: { total: totalProfiles, pending: pendingProfiles, verified: verifiedProfiles },
      listings: { total: totalListings, pending: pendingListings, approved: approvedListings },
    });
  } catch (err) {
    logger.error("getStats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
