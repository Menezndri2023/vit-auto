import logger from "../utils/logger.js";
import ImportExportRequest     from "../models/ImportExportRequest.js";
import ImporterPartnerProfile  from "../models/ImporterPartnerProfile.js";
import ImportExportListing     from "../models/ImportExportListing.js";
import User                    from "../models/User.js";
import Notification            from "../models/Notification.js";
import PartnerVerification     from "../models/PartnerVerification.js";
import PartnerOnboarding       from "../models/PartnerOnboarding.js";
import { ensureImporterProfile } from "../utils/ensureImporterProfile.js";
import { COUNTRY_CODE_TO_NAME } from "../utils/countries.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import { validateImageDataUri } from "../utils/imageValidation.js";

const MAX_LISTING_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_URL_LENGTH    = 2048;

// Même garde que vehicleController.js (validateVehicleImages) — absente ici
// jusqu'à présent : un partenaire pouvait soumettre un blob base64 énorme ou
// une chaîne arbitraire directement dans photos/mainPhoto, avec un risque
// concret de dépasser la limite BSON de 16 Mo par document MongoDB.
function validateListingImages(images) {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (typeof img !== "string" || !img) continue;
    if (img.startsWith("data:")) {
      const check = validateImageDataUri(img, MAX_LISTING_IMAGE_BYTES);
      if (!check.ok) return check.message;
    } else if (!/^https?:\/\//i.test(img) || img.length > MAX_IMAGE_URL_LENGTH) {
      return "Image invalide : URL http(s) ou image encodée attendue.";
    }
  }
  return null;
}

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
// Auto-provisionne un profil "vérifié" à partir du dossier Founding Partner signé
// (voir ensureImporterProfile) — un Founding Partner n'a plus besoin de soumettre
// une candidature "Importateur" séparée.
export const getMyImporterProfile = async (req, res) => {
  try {
    const profile = await ImporterPartnerProfile.findOne({ userId: req.user._id })
      || await ensureImporterProfile(req.user);
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
    const { sourceCountry, status, page = 1, limit = 20, partner, country } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const safePage  = Math.max(Number(page), 1);

    // Seul un admin peut consulter les annonces non approuvées (pending/rejected) —
    // sinon n'importe quel visiteur pourrait lister les annonces en attente de
    // validation d'un partenaire via ?status=pending (fuite d'information).
    const isAdmin = req.user?.role === "admin";

    const cacheKey = !isAdmin
      ? buildCacheKey("ie_listings", { sourceCountry, page, limit, partner, country })
      : null;
    if (cacheKey) {
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);
    }

    const filter = isAdmin && status ? { status } : { status: "approved" };

    if (sourceCountry) {
      const escaped = sourceCountry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.sourceCountry = new RegExp(escaped.slice(0, 100), "i");
    }
    if (partner && /^[0-9a-f]{24}$/i.test(String(partner))) filter.partner = partner;

    // Filtre international (code ISO du pays du visiteur) — une annonce est
    // pertinente pour ce pays si elle en provient (sourceCountry) OU si elle y
    // est proposée à la livraison (availableIn). "INTL"/absent = pas de filtre
    // (comportement actuel inchangé, cohérent avec vehicleController.getVehicles).
    if (country && country !== "INTL") {
      const countryName = COUNTRY_CODE_TO_NAME[String(country).toUpperCase()];
      if (countryName) {
        // Insensible à la casse : sourceCountry/availableIn sont de la saisie
        // libre (datalist, pas un enum strict), la casse exacte n'est pas garantie.
        const re = new RegExp(`^${countryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        filter.$or = [{ sourceCountry: re }, { availableIn: re }];
      }
    }

    const [listingsRaw, total] = await Promise.all([
      ImportExportListing.find(filter)
        .populate("partner", "firstName lastName profilePhoto business")
        .populate("importerProfile", "companyName badgeLevel")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      ImportExportListing.countDocuments(filter),
    ]);
    // `photos` (base64, jusqu'à plusieurs Mo/annonce) n'est jamais affiché en
    // vue liste — seul `mainPhoto` l'est (Catalogue/Favorites/IEListings/...).
    // `photosCount` est conservé pour le badge "📷 N" sans transférer le
    // tableau complet. Le détail (getListingById) reste seul à tout recevoir.
    const listings = listingsRaw.map((l) => (
      Array.isArray(l.photos) && l.photos.length > 0
        ? { ...l, photosCount: l.photos.length, photos: [] }
        : l
    ));

    const payload = { listings, total, pages: Math.ceil(total / safeLimit) };
    if (cacheKey) cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    logger.error("getListings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/listings/mine  — partenaire : ses propres annonces
export const getMyListings = async (req, res) => {
  try {
    const listingsRaw = await ImportExportListing.find({ partner: req.user._id })
      .populate("importerProfile", "companyName badgeLevel status")
      .sort({ createdAt: -1 })
      .lean();
    // `photos` (base64, jusqu'à plusieurs Mo/annonce) n'est jamais affiché en
    // vue liste — seul `mainPhoto` l'est (Catalogue/Favorites/IEListings/...).
    // Le détail (getListingById) reste seul à recevoir le tableau complet.
    const listings = listingsRaw.map((l) => (
      Array.isArray(l.photos) && l.photos.length > 0 ? { ...l, photos: [] } : l
    ));
    res.json({ listings });
  } catch (err) {
    logger.error("getMyListings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/listings/:id  — détail
export const getListingById = async (req, res) => {
  try {
    const listing = await ImportExportListing.findById(req.params.id)
      .populate("partner", "firstName lastName profilePhoto business phone")
      .populate("importerProfile", "companyName badgeLevel operatingCountries");

    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });

    // Masquer les annonces non approuvées à tout le monde sauf leur propriétaire et l'admin
    // (sinon une annonce encore en attente/rejetée serait consultable par ID deviné).
    const isOwner = listing.partner?._id?.toString() === req.user?._id?.toString();
    if (listing.status !== "approved" && req.user?.role !== "admin" && !isOwner) {
      return res.status(404).json({ message: "Annonce introuvable." });
    }

    // Vue comptabilisée uniquement pour les annonces publiques déjà approuvées
    if (listing.status === "approved") {
      await ImportExportListing.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
    }

    res.json({ listing });
  } catch (err) {
    logger.error("getListingById:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/import-export/listings  — Founding Partner uniquement
export const createListing = async (req, res) => {
  try {
    if (!req.user.isFounder) {
      return res.status(403).json({
        code:    "FOUNDING_PARTNER_REQUIRED",
        message: "Devenez Founding Partner pour publier des annonces d'export.",
      });
    }
    // Suspension/rejet Vérification Partenaire — voir vehicleController.js
    // createVehicle pour l'explication complète : isFounder ne communique
    // jamais avec PartnerVerification, un admin "suspendant" un Founding
    // Partner via l'onglet Vérification Partenaires ne l'empêchait pas de
    // continuer à publier des annonces export.
    const suspendedVerif = await PartnerVerification.findOne({
      userId: req.user._id,
      status: { $in: ["suspendu", "rejete"] },
    }).select("status").lean();
    if (suspendedVerif) {
      return res.status(403).json({
        code:    "PARTNER_SUSPENDED",
        message: suspendedVerif.status === "suspendu"
          ? "Votre dossier partenaire est suspendu. Contactez le support VIT AUTO."
          : "Votre dossier partenaire a été rejeté. Contactez le support VIT AUTO.",
      });
    }
    // Plafond annonces pour un Founding Partner "particulier" — même principe
    // que INDIVIDUAL_SELLER_MAX_ACTIVE (vehicleController.js), mais ce champ
    // vient de PartnerOnboarding.legalEntityType (pas User.sellerType, qui
    // concerne uniquement le marché local location/vente).
    const INDIVIDUAL_FOUNDER_MAX_ACTIVE = 10;
    const onboarding = await PartnerOnboarding.findOne({ userId: req.user._id }).select("legalEntityType").lean();
    if (onboarding?.legalEntityType === "particulier") {
      const activeCount = await ImportExportListing.countDocuments({ partner: req.user._id, status: { $ne: "rejected" } });
      if (activeCount >= INDIVIDUAL_FOUNDER_MAX_ACTIVE) {
        return res.status(403).json({
          code:    "LISTING_LIMIT_REACHED",
          message: `Les Partenaires Fondateurs "Particulier" sont limités à ${INDIVIDUAL_FOUNDER_MAX_ACTIVE} annonces actives.`,
        });
      }
    }

    const importerProfile = await ensureImporterProfile(req.user);

    const {
      title, make, model, year, mileage, fuelType, transmission,
      bodyType, color, condition, description,
      sourceCountry, sourceCity, availableIn,
      price, currency, priceIncludes, negotiable, stockQty,
      photos, mainPhoto,
      vin, vehicleHistory, estimatedShippingCost, shippingCostCurrency,
      estimatedDelay, shippingType, exportDocumentsAvailable, videoUrl,
      acceptedPaymentMethods,
    } = req.body;

    if (!title || !make || !model || !year || !sourceCountry || !price) {
      return res.status(400).json({ message: "Champs obligatoires manquants." });
    }
    // Sans pays de destination, l'annonce n'est trouvable par aucun client
    // (filtre pays du catalogue — voir getListings) : le partenaire doit en
    // déclarer au moins un.
    if (!Array.isArray(availableIn) || availableIn.length === 0) {
      return res.status(400).json({ message: "Indiquez au moins un pays de destination (livraison disponible vers)." });
    }

    const imagesError = validateListingImages([...(photos || []), mainPhoto].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });

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
      vin: vin || null,
      vehicleHistory: vehicleHistory || null,
      estimatedShippingCost: estimatedShippingCost != null ? Number(estimatedShippingCost) : null,
      shippingCostCurrency: shippingCostCurrency || "EUR",
      estimatedDelay: estimatedDelay || null,
      shippingType: shippingType || null,
      exportDocumentsAvailable: exportDocumentsAvailable || [],
      videoUrl: videoUrl || null,
      acceptedPaymentMethods: acceptedPaymentMethods || [],
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
    const isAdmin = req.user.role === "admin";
    // Le filtre `partner: req.user._id` excluait de fait TOUT admin (son ID ne
    // correspond jamais au partenaire propriétaire) — l'édition admin de cet
    // endpoint était inatteignable malgré les vérifications `role !== admin`
    // plus bas qui laissaient croire le contraire.
    const listing = await ImportExportListing.findOne(
      isAdmin ? { _id: req.params.id } : { _id: req.params.id, partner: req.user._id }
    );
    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });
    // Une vente conclue ("sold") est un historique figé — tout le reste
    // (draft/pending/approved/rejected/archived) reste modifiable par le
    // partenaire propriétaire. Modifier une annonce déjà approuvée la repasse
    // en "pending" ci-dessous (re-modération), cohérent avec vehicleController.
    if (listing.status === "sold" && !isAdmin) {
      return res.status(403).json({ message: "Une annonce vendue ne peut plus être modifiée." });
    }

    // Whitelist des champs modifiables par le partenaire (évite le mass assignment)
    const {
      title, make, model, year, mileage, fuelType, transmission,
      bodyType, color, condition, description,
      sourceCountry, sourceCity, availableIn,
      price, currency, priceIncludes, negotiable, stockQty,
      photos, mainPhoto,
      vin, vehicleHistory, estimatedShippingCost, shippingCostCurrency,
      estimatedDelay, shippingType, exportDocumentsAvailable, videoUrl,
      acceptedPaymentMethods,
    } = req.body;

    const imagesError = validateListingImages([...(photos || []), mainPhoto].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });
    if (availableIn !== undefined && (!Array.isArray(availableIn) || availableIn.length === 0)) {
      return res.status(400).json({ message: "Indiquez au moins un pays de destination (livraison disponible vers)." });
    }

    // Un champ omis (undefined) doit garder sa valeur existante — l'ancienne
    // version écrasait directement title/make/model/fuelType/... par
    // `undefined` dès qu'un appelant envoyait un payload partiel (aucune UI ne
    // le fait aujourd'hui, mais l'API elle-même le permettait), ce qui faisait
    // échouer la validation Mongoose des champs requis à la sauvegarde.
    Object.assign(listing, {
      title: title !== undefined ? title : listing.title,
      make: make !== undefined ? make : listing.make,
      model: model !== undefined ? model : listing.model,
      year: year ? Number(year) : listing.year,
      mileage: mileage !== undefined ? Number(mileage) : listing.mileage,
      fuelType: fuelType !== undefined ? fuelType : listing.fuelType,
      transmission: transmission !== undefined ? transmission : listing.transmission,
      bodyType: bodyType !== undefined ? bodyType : listing.bodyType,
      color: color !== undefined ? color : listing.color,
      condition: condition !== undefined ? condition : listing.condition,
      description: description !== undefined ? description : listing.description,
      sourceCountry: sourceCountry !== undefined ? sourceCountry : listing.sourceCountry,
      sourceCity: sourceCity !== undefined ? sourceCity : listing.sourceCity,
      availableIn: availableIn || listing.availableIn,
      price: price ? Number(price) : listing.price,
      currency: currency || listing.currency,
      priceIncludes: priceIncludes || listing.priceIncludes,
      negotiable: negotiable !== undefined ? !!negotiable : listing.negotiable,
      stockQty: stockQty ? Number(stockQty) : listing.stockQty,
      photos: photos || listing.photos,
      mainPhoto: mainPhoto || listing.mainPhoto,
      vin: vin !== undefined ? vin : listing.vin,
      vehicleHistory: vehicleHistory !== undefined ? vehicleHistory : listing.vehicleHistory,
      estimatedShippingCost: estimatedShippingCost != null ? Number(estimatedShippingCost) : listing.estimatedShippingCost,
      shippingCostCurrency: shippingCostCurrency || listing.shippingCostCurrency,
      estimatedDelay: estimatedDelay !== undefined ? estimatedDelay : listing.estimatedDelay,
      shippingType: shippingType !== undefined ? shippingType : listing.shippingType,
      exportDocumentsAvailable: exportDocumentsAvailable || listing.exportDocumentsAvailable,
      videoUrl: videoUrl !== undefined ? videoUrl : listing.videoUrl,
      acceptedPaymentMethods: acceptedPaymentMethods || listing.acceptedPaymentMethods,
      // Une édition partenaire repasse l'annonce en modération (pas de
      // scoring automatique côté IE, contrairement aux véhicules) ; une
      // édition admin ne touche pas au statut qu'il a lui-même déjà décidé.
      status: isAdmin ? listing.status : "pending",
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

    const [listingsRaw, total] = await Promise.all([
      ImportExportListing.find(filter)
        .populate("partner", "firstName lastName email profilePhoto")
        .populate("importerProfile", "companyName badgeLevel")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      ImportExportListing.countDocuments(filter),
    ]);
    // `photos` (base64, jusqu'à plusieurs Mo/annonce) n'est jamais affiché en
    // vue liste — seul `mainPhoto` l'est (Catalogue/Favorites/IEListings/...).
    // Le détail (getListingById) reste seul à recevoir le tableau complet.
    const listings = listingsRaw.map((l) => (
      Array.isArray(l.photos) && l.photos.length > 0 ? { ...l, photos: [] } : l
    ));

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
