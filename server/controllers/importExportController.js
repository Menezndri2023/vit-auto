import logger from "../utils/logger.js";
import { uploadBase64Images, FOLDERS } from "../config/imagekit.js";
import ImportExportRequest     from "../models/ImportExportRequest.js";
import ImporterPartnerProfile  from "../models/ImporterPartnerProfile.js";
import ImportExportListing     from "../models/ImportExportListing.js";
import User                    from "../models/User.js";
import Notification            from "../models/Notification.js";
import PartnerVerification     from "../models/PartnerVerification.js";
import PartnerOnboarding       from "../models/PartnerOnboarding.js";
import PartnerBusiness         from "../models/PartnerBusiness.js";
import { ensureImporterProfile } from "../utils/ensureImporterProfile.js";
import { COUNTRY_CODE_TO_NAME } from "../utils/countries.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import { validateImageDataUri } from "../utils/imageValidation.js";
import { isIncotermCompatible } from "../constants/incoterms.js";
import { validateListingForPublication } from "../services/ieListingValidation.js";
import { resolveDefaultPartnerBusinessId } from "../utils/ensureDefaultPartnerBusiness.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { isMalformedObjectId } from "../utils/objectId.js";

const MAX_LISTING_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_URL_LENGTH    = 2048;

// Bug réel corrigé (audit) : les 3 Notification.create() de ce fichier ne
// déclenchaient jamais d'émission socket temps réel (contrairement au
// patron déjà utilisé dans bookingController.js/partnerOnboardingController.js) —
// le client/partenaire ne voyait la mise à jour qu'au prochain polling (20s).
async function notify(userId, data) {
  if (!userId) return;
  const notif = await Notification.create({ user: userId, ...data }).catch(() => null);
  if (notif && global._io) {
    global._io.to(`user_${userId}`).emit("notification_new", {
      _id: notif._id, ...data, lu: false, createdAt: notif.createdAt,
    });
  }
}

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

    // Notifier les admins — bug réel corrigé (audit) : Notification.insertMany
    // ne pousse jamais l'événement socket temps réel (contrairement à
    // notifyAdmins(), déjà utilisé partout ailleurs sur le site) — l'admin ne
    // découvrait cette demande qu'au prochain rechargement/poll, comme le
    // trou déjà comblé pour vehicle/driver/KYC/showroom.
    notifyAdmins(
      "ie_request",
      "Nouvelle demande Import/Export",
      `${firstName} ${lastName} — Pack ${pack || "Silver"} — ${sourceCountry || "?"} → ${destCountry || "?"}`,
      "/admin",
    ).catch((e) => logger.error("notifyAdmins createRequest (non bloquant) :", e.message));

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
        await notify(request.userId, {
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

      // Notifier admins (temps réel — voir notifyAdmins.js)
      notifyAdmins(
        "ie_profile",
        "Candidature importateur re-soumise",
        `${req.user.firstName} ${req.user.lastName} a re-soumis sa candidature importateur.`,
        "/admin",
      ).catch((e) => logger.error("notifyAdmins submitImporterProfile (non bloquant) :", e.message));

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

    // Notifier admins (temps réel — voir notifyAdmins.js)
    notifyAdmins(
      "ie_profile",
      "Nouvelle candidature importateur",
      `${req.user.firstName} ${req.user.lastName} (${companyName}) a soumis sa candidature.`,
      "/admin",
    ).catch((e) => logger.error("notifyAdmins submitImporterProfile (non bloquant) :", e.message));

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
    await notify(profile.userId._id, {
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
      // `slice` APRÈS l'échappement coupait un antislash doublé en deux et
      // produisait une expression invalide → 500 sur une route publique. Et
      // `sourceCountry` n'était pas converti : `?sourceCountry=a&sourceCountry=b`
      // arrive en TABLEAU et faisait planter `.replace`. Ordre corrigé, comme
      // partout ailleurs dans le projet.
      const escaped = String(sourceCountry).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.sourceCountry = new RegExp(escaped, "i");
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

    // `photos` (base64, jusqu'à plusieurs Mo par annonce) n'est jamais affiché
    // en vue liste — seul `mainPhoto` l'est. Il était pourtant RAPATRIÉ depuis
    // Atlas puis vidé en mémoire : 211 annonces pèsent 441 Mo, soit ~104 Mo
    // transférés pour une page de 50 et ~42 Mo pour la page de 20 de
    // l'interface. En production, la requête dépassait le délai maximum et la
    // route publique renvoyait 500 — catalogue Import/Export inaccessible.
    // `-photos` exclut le champ CÔTÉ BASE : plus rien ne transite.
    const [listingsRaw, total] = await Promise.all([
      ImportExportListing.find(filter)
        .select("-photos")
        .populate("partner", "firstName lastName profilePhoto business")
        .populate("importerProfile", "companyName badgeLevel")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      ImportExportListing.countDocuments(filter),
    ]);

    // Le badge « 📷 N » a toujours besoin du NOMBRE de photos. `$size` le
    // calcule dans MongoDB et ne renvoie qu'un entier par annonce : le tableau
    // ne quitte jamais la base. Non bloquant — un badge absent vaut mieux
    // qu'une liste en erreur.
    let comptes = new Map();
    try {
      const ids = listingsRaw.map((l) => l._id);
      const res2 = ids.length
        ? await ImportExportListing.aggregate([
            { $match: { _id: { $in: ids } } },
            { $project: { n: { $size: { $ifNull: ["$photos", []] } } } },
          ])
        : [];
      comptes = new Map(res2.map((r) => [String(r._id), r.n]));
    } catch (err) {
      logger.warn?.("getListings: comptage des photos indisponible", { error: err.message });
    }
    const listings = listingsRaw.map((l) => ({ ...l, photosCount: comptes.get(String(l._id)) ?? 0 }));

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
      // Fuite PII/fiscale corrigée (audit sécurité 2026-09) : `business` renvoyait
      // le sous-document COMPLET — companyName, mais aussi RCCM, numéro fiscal et
      // adresse du siège — et `phone` le contact direct du partenaire, sur une
      // route PUBLIQUE. En itérant sur les annonces, on reconstituait l'annuaire
      // fiscal et téléphonique de tous les exportateurs. Le projet applique déjà
      // cette restriction ailleurs (usersController.getPublicProfile, pmsController) :
      // seul le nom commercial et le logo ont vocation à être publics.
      .populate("partner", "firstName lastName profilePhoto business.companyName business.logo")
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
// Variantes d'Incoterm proposées par l'exportateur, avec leur prix.
//
// Trois garde-fous, chacun pour une raison vécue :
//  • une règle maritime (FOB/CIF/CFR/FAS) sur un envoi aérien promettrait à
//    l'acheteur une condition de vente inapplicable ;
//  • la règle par défaut de l'annonce n'a pas à être répétée ici — son prix,
//    c'est `price` ;
//  • un prix nul ou négatif rendrait l'importation gratuite dans le devis. On
//    l'efface plutôt que de le refuser : `null` signifie « prix à convenir »,
//    et l'annonce affichera un tiret.
function sanitizeIncotermPricing(entrees, shippingType, incotermParDefaut) {
  if (!Array.isArray(entrees)) return [];
  const vues = new Set();
  return entrees.reduce((acc, e) => {
    const code = String(e?.incoterm || "").toUpperCase();
    if (!code || vues.has(code)) return acc;
    if (code === incotermParDefaut) return acc;
    if (!isIncotermCompatible(code, shippingType)) return acc;
    vues.add(code);
    const prix = Number(e?.price);
    acc.push({ incoterm: code, price: Number.isFinite(prix) && prix > 0 ? prix : null });
    return acc;
  }, []);
}

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
    // ── Entreprise du partenaire (facultatif, comme Vehicle.business) ──────
    // Résolue AVANT la vérification du dossier Founding Partner ci-dessous : le
    // Programme est désormais PAR ENTITÉ (voir PartnerOnboarding.businessId), le
    // dossier à vérifier est donc celui de l'entité utilisée pour CETTE annonce,
    // pas un dossier arbitraire parmi ceux du partenaire.
    const { businessId } = req.body;
    // Un businessId malformé lèverait un CastError (→ 500) au lieu d'un refus clair.
    if (isMalformedObjectId(businessId)) return res.status(400).json({ message: "Entreprise invalide." });
    let business = null;
    if (businessId) {
      business = await PartnerBusiness.findOne({ _id: businessId, owner: req.user._id }).lean();
      if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
    }

    // Plafond annonces pour un Founding Partner "particulier" — même principe
    // que INDIVIDUAL_SELLER_MAX_ACTIVE (vehicleController.js), mais ce champ
    // vient de PartnerOnboarding.legalEntityType (pas User.sellerType, qui
    // concerne uniquement le marché local location/vente).
    const INDIVIDUAL_FOUNDER_MAX_ACTIVE = 10;
    // Si l'annonce ne précise pas d'entité, on retombe sur l'entité par défaut
    // du partenaire (le cas courant pour un particulier n'ayant jamais choisi
    // d'entité explicitement) plutôt que de chercher un dossier businessId:null,
    // qui n'existe plus après la migration vers le Founding Partner par entité.
    const onboardingBusinessId = business?._id || await resolveDefaultPartnerBusinessId(req.user._id);
    const onboarding = await PartnerOnboarding.findOne({ userId: req.user._id, businessId: onboardingBusinessId }).select("legalEntityType").lean();
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
      acceptedPaymentMethods, incoterm, incotermPricing,
    } = req.body;

    // Contrôle complet avant publication. La validation se résumait à
    // « Champs obligatoires manquants » — sans dire lesquels : le partenaire
    // corrigeait au hasard, ou renonçait. Elle distingue désormais ce qui
    // BLOQUE de ce qui mérite un AVERTISSEMENT, ce dernier étant le plus utile :
    // une annonce dont le véhicule dépasse la limite d'âge d'un pays de
    // destination est parfaitement valide, mais le véhicule y serait refusé au
    // port. Le partenaire doit le savoir avant de publier, pas le découvrir
    // après le paiement de l'acheteur.
    const controle = await validateListingForPublication(req.body);
    if (!controle.valid) {
      return res.status(400).json({
        message: controle.errors[0].message,
        errors: controle.errors,
        warnings: controle.warnings,
      });
    }

    const imagesError = validateListingImages([...(photos || []), mainPhoto].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });

    // Les photos envoyées par le partenaire arrivent en base64. Stockées telles
    // quelles DANS le document, elles l'alourdissaient de plusieurs mégaoctets :
    // 211 annonces pesaient 441 Mo et la route publique de liste finissait par
    // dépasser le délai maximum — panne réelle du catalogue Import/Export, voir
    // scripts/migrateIEPhotosToImageKit.mjs. On les héberge donc sur ImageKit
    // dès la création, et le document ne garde que des URL.
    //
    // Le partenaire continue d'envoyer SES vraies photos exactement comme
    // avant : rien ne change pour lui, seul l'endroit où l'image est rangée
    // change. Sans identifiants ImageKit, uploadBase64Images renvoie l'entrée
    // inchangée — la publication reste possible, jamais bloquée par
    // l'indisponibilité d'un service tiers.
    const photosHebergees   = await uploadBase64Images(photos || [], FOLDERS.vehicles);
    const [mainPhotoHeberge] = mainPhoto
      ? await uploadBase64Images([mainPhoto], FOLDERS.vehicles)
      : [null];

    const listing = await ImportExportListing.create({
      partner: req.user._id,
      business: business?._id || null,
      importerProfile: importerProfile._id,
      title, make, model, year: Number(year),
      mileage: Number(mileage) || 0,
      fuelType, transmission, bodyType, color,
      condition: condition || "occasion",
      description,
      sourceCountry, sourceCity,
      availableIn: availableIn || [],
      // USD par défaut : devise de cotation des exportateurs et pivot de la
      // plateforme. L'euro par défaut étiquetait « EUR » un prix saisi en
      // dollars, avec ~8 % d'écart pour l'acheteur.
      price: Number(price), currency: currency || "USD",
      priceIncludes: priceIncludes || [],
      negotiable: !!negotiable,
      stockQty: Number(stockQty) || 1,
      photos: photosHebergees,
      mainPhoto: mainPhotoHeberge || (photosHebergees?.[0] || null),
      vin: vin || null,
      vehicleHistory: vehicleHistory || null,
      estimatedShippingCost: estimatedShippingCost != null ? Number(estimatedShippingCost) : null,
      shippingCostCurrency: shippingCostCurrency || "USD",
      estimatedDelay: estimatedDelay || null,
      shippingType: shippingType || null,
      exportDocumentsAvailable: exportDocumentsAvailable || [],
      videoUrl: videoUrl || null,
      acceptedPaymentMethods: acceptedPaymentMethods || [],
      incoterm: incoterm || null,
      // Sans cette ligne, le champ serait ignoré SANS ERREUR : le formulaire
      // afficherait « enregistré » et les variantes n'existeraient pas. C'est
      // le motif exact qui avait laissé Vehicle.featured mort pendant des mois.
      incotermPricing: sanitizeIncotermPricing(incotermPricing, shippingType, incoterm),
      status: "pending",
    });

    // Notifier admins (temps réel — voir notifyAdmins.js)
    notifyAdmins(
      "ie_listing",
      "Nouvelle annonce import/export",
      `${req.user.firstName} ${req.user.lastName} — ${title} (${sourceCountry})`,
      "/admin",
    ).catch((e) => logger.error("notifyAdmins createListing (non bloquant) :", e.message));

    // Les avertissements accompagnent la réussite : l'annonce est bien créée,
    // mais le partenaire apprend tout de suite ce qui la desservira — véhicule
    // refusé au port dans l'un des pays visés, absence d'Incoterm, trop peu de
    // photos. Le lui dire après coup, c'est le lui laisser découvrir par
    // l'absence d'acheteurs.
    res.status(201).json({
      message: "Annonce soumise pour validation.",
      listing,
      warnings: controle.warnings,
    });
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
      acceptedPaymentMethods, incoterm, incotermPricing, businessId,
    } = req.body;

    let business = undefined;
    if (businessId !== undefined) {
      if (businessId !== null && isMalformedObjectId(businessId)) {
        return res.status(400).json({ message: "Entreprise invalide." });
      }
      if (businessId === null) {
        business = null;
      } else {
        business = await PartnerBusiness.findOne({ _id: businessId, owner: listing.partner }).lean();
        if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
      }
    }

    const photosMaj = photos ? await uploadBase64Images(photos, FOLDERS.vehicles) : undefined;
    const [mainPhotoMaj] = mainPhoto ? await uploadBase64Images([mainPhoto], FOLDERS.vehicles) : [undefined];

    const imagesError = validateListingImages([...(photos || []), mainPhoto].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });
    if (availableIn !== undefined && (!Array.isArray(availableIn) || availableIn.length === 0)) {
      return res.status(400).json({ message: "Indiquez au moins un pays de destination (livraison disponible vers)." });
    }
    // Un champ omis garde son ancienne valeur (voir Object.assign plus bas) —
    // la validation doit donc tenir compte de la valeur effective résultante,
    // pas seulement de ce que ce PUT envoie.
    const effectiveIncoterm = incoterm !== undefined ? incoterm : listing.incoterm;
    const effectiveShippingType = shippingType !== undefined ? shippingType : listing.shippingType;
    if (effectiveIncoterm && !isIncotermCompatible(effectiveIncoterm, effectiveShippingType)) {
      return res.status(400).json({ message: "Cet Incoterm est réservé au transport maritime — choisissez FAS, FOB, CFR ou CIF uniquement avec un type de transport maritime." });
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
      photos: photosMaj || listing.photos,
      mainPhoto: mainPhotoMaj || listing.mainPhoto,
      vin: vin !== undefined ? vin : listing.vin,
      vehicleHistory: vehicleHistory !== undefined ? vehicleHistory : listing.vehicleHistory,
      estimatedShippingCost: estimatedShippingCost != null ? Number(estimatedShippingCost) : listing.estimatedShippingCost,
      shippingCostCurrency: shippingCostCurrency || listing.shippingCostCurrency,
      estimatedDelay: estimatedDelay !== undefined ? estimatedDelay : listing.estimatedDelay,
      shippingType: shippingType !== undefined ? shippingType : listing.shippingType,
      exportDocumentsAvailable: exportDocumentsAvailable || listing.exportDocumentsAvailable,
      videoUrl: videoUrl !== undefined ? videoUrl : listing.videoUrl,
      acceptedPaymentMethods: acceptedPaymentMethods || listing.acceptedPaymentMethods,
      // `undefined` = champ absent du corps → on garde l'existant. Un tableau
      // vide EFFACE volontairement les variantes : le partenaire doit pouvoir
      // n'en proposer plus aucune, pas seulement les modifier.
      incotermPricing: incotermPricing === undefined
        ? listing.incotermPricing
        : sanitizeIncotermPricing(incotermPricing, effectiveShippingType, effectiveIncoterm),
      incoterm: effectiveIncoterm || null,
      business: business !== undefined ? (business?._id || null) : listing.business,
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
        // `approvedBy/At` n'étaient remis à null que parce que le statut n'était
        // pas "approved" — archiver une annonce DÉJÀ validée effaçait donc la
        // trace de qui l'avait validée et quand. On ne les touche qu'à la
        // validation elle-même, ou à un refus explicite.
        ...(status === "approved"
          ? { approvedBy: req.user._id, approvedAt: new Date() }
          : status === "rejected"
            ? { approvedBy: null, approvedAt: null }
            : {}),
      },
      { new: true }
    ).populate("partner", "firstName lastName");

    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });

    // Notifier le partenaire
    // L'archivage annonçait au partenaire « Votre annonce a été refusée » —
    // message faux et alarmant pour une annonce publiée puis simplement retirée.
    const isArchived = status === "archived";
    await notify(listing.partner._id, {
      type:    status === "approved" ? "success" : isArchived ? "info" : "error",
      titre:   status === "approved" ? "Annonce import/export publiée !"
             : isArchived ? "Annonce import/export archivée"
             : "Annonce import/export refusée",
      message: status === "approved"
        ? `Votre annonce "${listing.title}" est maintenant publiée sur VIT AUTO.`
        : isArchived
          ? `Votre annonce "${listing.title}" a été retirée du catalogue.${adminNote ? " Motif : " + adminNote : ""}`
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
