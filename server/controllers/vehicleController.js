import logger from "../utils/logger.js";
import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import Booking from "../models/Booking.js";
import PartnerVerification from "../models/PartnerVerification.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { dispatch } from "../queue/index.js";
import { scoreAnnonce, buildVehicleWhitelist, limitVehicleImages } from "../services/vehicleScoring.js";
import { logAction } from "../middleware/auditLog.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import { validateImageDataUri } from "../utils/imageValidation.js";
import { ensureImporterProfile } from "../utils/ensureImporterProfile.js";
import { COUNTRY_CODE_TO_NAME } from "../utils/countries.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MAX_VEHICLE_IMAGE_BYTES = 6 * 1024 * 1024; // cohérent avec KYC/profil
const MAX_IMAGE_URL_LENGTH    = 2048;

// `images` n'était jamais validé côté serveur (seule la longueur du tableau
// l'était) : un partenaire authentifié pouvait soumettre un blob base64 énorme
// ou une chaîne arbitraire directement dans ce champ, indépendamment du flux
// prévu (compression client + upload ImageKit). Chaque entrée doit être soit
// une data URI image valide (magic bytes + taille, comme KYC), soit une URL
// http(s) de longueur raisonnable.
function validateVehicleImages(images) {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (typeof img !== "string" || !img) continue;
    if (img.startsWith("data:")) {
      const check = validateImageDataUri(img, MAX_VEHICLE_IMAGE_BYTES);
      if (!check.ok) return check.message;
    } else if (!/^https?:\/\//i.test(img) || img.length > MAX_IMAGE_URL_LENGTH) {
      return "Image invalide : URL http(s) ou image encodée attendue.";
    }
  }
  return null;
}

// ── Créer une annonce véhicule (partenaire) ───────────────────────────────────
export const createVehicle = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    // ── Type de vendeur (particulier vs professionnel/entreprise) ─────────
    // Normalement déjà fixé à l'inscription (voir Register.jsx/authController.js).
    // Ce champ n'est JAMAIS relu depuis req.body une fois qu'il est déjà défini
    // sur le compte — sinon un partenaire "entreprise" pourrait déclarer
    // "particulier" à chaque annonce pour contourner la certification complète.
    // Le corps de la requête ne sert qu'à amorcer les comptes plus anciens (créés
    // avant ce champ, ou promus "partenaire" via applyToProgram) une seule fois.
    const SELLER_TYPES = ["particulier", "professionnel", "entreprise"];
    if (!req.user.sellerType && SELLER_TYPES.includes(req.body.typePubliant)) {
      req.user.sellerType = req.body.typePubliant;
      await req.user.save();
    }
    const isIndividualSeller = req.user.sellerType === "particulier";

    // ── Vérification requise avant publication ─────────────────────────────
    // Un particulier vendant son propre véhicule ne doit pas franchir le même mur
    // que les entreprises (RCCM, IBAN, documents export — voir PartnerCertification.js) :
    // pour lui, la vérification d'identité KYC (pièce + selfie + face-match, déjà
    // disponible via /kyc) suffit à publier — code KYC_REQUIRED, redirection
    // frontend vers /kyc (voir VendorSubmit.jsx). Un professionnel/une entreprise
    // (ou un compte sans type renseigné) reste soumis à la certification partenaire
    // complète, sauf Founding Partner déjà vérifié — code CERTIFICATION_REQUIRED,
    // redirection vers /partner-onboarding.
    if (req.user.role === "partenaire" && !req.user.isFounder) {
      if (isIndividualSeller) {
        if (req.user.kycStatus !== "VERIFIE") {
          return res.status(403).json({
            code:    "KYC_REQUIRED",
            message: "Complétez votre vérification d'identité (pièce d'identité + selfie) avant de publier.",
          });
        }
      } else if (req.user.certificationBadge === "none") {
        return res.status(403).json({
          code:    "CERTIFICATION_REQUIRED",
          message: "Complétez votre vérification partenaire avant de publier une annonce.",
        });
      }
    }

    // ── Suspension/rejet Vérification Partenaire ────────────────────────────
    // certificationBadge (ci-dessus) et PartnerVerification sont deux systèmes
    // de vérification distincts qui ne communiquaient jamais entre eux : un
    // admin suspendant/rejetant un dossier via l'onglet "Vérification
    // Partenaires" (adminUpdateStatus) ne faisait qu'envoyer une notification —
    // rien n'empêchait réellement le partenaire de continuer à publier.
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

    // ── Plafond annonces "particulier" ──────────────────────────────────────
    // Le KYC identité (léger) n'atteste que de qui est le vendeur, pas de la
    // légitimité commerciale d'une flotte — sans plafond, un professionnel non
    // certifié pourrait déclarer "particulier" une fois puis publier un nombre
    // illimité de véhicules avec la seule vérification d'identité individuelle.
    // Un particulier vendant/louant réellement ses propres véhicules dépasse
    // rarement 3 annonces actives simultanées ; au-delà, la certification
    // entreprise complète est requise.
    const INDIVIDUAL_SELLER_MAX_ACTIVE = 3;
    // Un particulier devenu Founding Partner reste un particulier (KYC identité,
    // jamais la certification entreprise complète) — mais la vérification plus
    // poussée du programme (LOI/Accord signés) justifie un plafond plus large
    // que le compte "particulier" standard.
    const INDIVIDUAL_FOUNDER_MAX_ACTIVE = 10;
    if (isIndividualSeller) {
      const cap = req.user.isFounder ? INDIVIDUAL_FOUNDER_MAX_ACTIVE : INDIVIDUAL_SELLER_MAX_ACTIVE;
      const activeCount = await Vehicle.countDocuments({ owner: req.user._id, status: { $ne: "rejected" } });
      if (activeCount >= cap) {
        return res.status(403).json({
          code:    "CERTIFICATION_REQUIRED",
          message: req.user.isFounder
            ? `Les Partenaires Fondateurs "Particulier" sont limités à ${cap} annonces actives.`
            : `Les comptes "Particulier" sont limités à ${cap} annonces actives. Complétez la certification entreprise pour publier davantage.`,
        });
      }
    }

    // ── Détection doublon (même marque + modèle + année + propriétaire) ────
    const dupMarque = req.body.marque;
    const dupModele = req.body.modele;
    const dupAnnee  = req.body.annee;
    if (dupMarque && dupModele && dupAnnee) {
      const existing = await Vehicle.findOne({
        owner:  req.user._id,
        marque: new RegExp(`^${escapeRegex(String(dupMarque))}$`, "i"),
        modele: new RegExp(`^${escapeRegex(String(dupModele))}$`, "i"),
        annee:  Number(dupAnnee),
        status: { $ne: "rejected" },
      });
      if (existing) {
        return res.status(409).json({
          message: `Vous avez déjà une annonce pour ce véhicule (${dupMarque} ${dupModele} ${dupAnnee}). Modifiez l'annonce existante.`,
          existingId: existing._id,
        });
      }
    }

    // ── Limite photos (max 8 côté backend) ────────────────────────────────
    if (req.body.images && req.body.images.length > 8) {
      req.body.images = req.body.images.slice(0, 8);
    }
    const imagesError = validateVehicleImages([...(req.body.images || []), req.body.thumbnail].filter(Boolean));
    if (imagesError) return res.status(400).json({ message: imagesError });

    // ── Validation automatique ──────────────────────────────────────────────
    const validation = scoreAnnonce(req.body);

    // Extraire uniquement les champs légitimes du formulaire (pas de mass assignment sur stats/owner)
    const whitelisted = buildVehicleWhitelist(req.body);

    const vehicle = await Vehicle.create({
      ...whitelisted,
      // Champs serveur — jamais depuis req.body
      owner:              req.user._id,
      country:            req.user.country || null,
      status:             validation.status,
      available:          validation.status === "approved",
      validationScore:    validation.score,
      validationErrors:   validation.errors,
      validationWarnings: validation.warnings,
      autoValidated:      true,
      rejectionReason:    validation.status === "rejected"
        ? validation.errors.join(". ")
        : null,
      vues:        0,
      noteMoyenne: 0,
      nombreAvis:  0,
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
      logger.error("Notification (non bloquant) :", notifErr.message);
    }

    // Calcul du score AI en arrière-plan
    dispatch.vehicleCreated(vehicle._id.toString()).catch(() => {});

    res.status(201).json({ vehicle, validation });
  } catch (err) {
    logger.error("createVehicle:", err);
    res.status(400).json({ message: "Erreur création véhicule." });
  }
};

// ── Tous les véhicules approuvés (public) avec pagination ────────────────────
export const getVehicles = async (req, res) => {
  try {
    const {
      type, ville, carburant, transmission, minPrice, maxPrice,
      vehicleType, search, owner, country, dureeLocation,
      lat, lng, radiusKm = 50,
      page  = 1,
      limit = 20,
      status,    // admin uniquement
    } = req.query;

    const isAdmin = req.user?.role === "admin";
    const clientLat = parseFloat(lat);
    const clientLng = parseFloat(lng);
    const hasGeo = !isAdmin && Number.isFinite(clientLat) && Number.isFinite(clientLng);

    // Cache mémoire (public, non-géolocalisé uniquement — voir utils/catalogCache.js) :
    // le catalogue est haute-lecture, une fraîcheur de quelques secondes est
    // largement acceptable et évite de re-taper Mongo à chaque requête identique.
    const cacheKey = !isAdmin && !hasGeo
      ? buildCacheKey("vehicles", { type, ville, carburant, transmission, minPrice, maxPrice, vehicleType, search, owner, country, dureeLocation, page, limit })
      : null;
    if (cacheKey) {
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);
    }

    let filter;
    if (isAdmin && status && status !== "all") {
      filter = { status };                            // admin filtre par statut précis
    } else if (isAdmin) {
      filter = {};                                    // admin sans filtre = tous les statuts
    } else {
      filter = { status: "approved", available: true }; // public = approuvés seulement
    }

    if (type)         filter.type = type;
    if (vehicleType)  filter.vehicleType = vehicleType;
    if (ville)        filter.ville = new RegExp(escapeRegex(String(ville).slice(0, 100)), "i");
    if (carburant)    filter.carburant = carburant;
    if (transmission) filter.transmission = transmission;
    // Un véhicule "les_deux" (défaut) reste visible sous les deux filtres —
    // seul un véhicule explicitement limité à une durée est exclu de l'autre.
    if (dureeLocation && ["courte", "longue"].includes(dureeLocation)) {
      filter.rentalDurationType = { $in: [dureeLocation, "les_deux"] };
    }
    if (search) {
      const s = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { title:  new RegExp(s, "i") },
        { marque: new RegExp(s, "i") },
        { modele: new RegExp(s, "i") },
      ];
    }
    if (minPrice || maxPrice) {
      filter.pricePerDay = {};
      if (minPrice) filter.pricePerDay.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
    }
    // Filtre par propriétaire (showroom public partenaire) — validé ObjectId uniquement
    if (owner && /^[0-9a-f]{24}$/i.test(String(owner))) filter.owner = owner;

    // Filtre pays (International/"INTL" ou absent = aucune restriction). Les
    // annonces sans pays renseigné (créées avant cette fonctionnalité) restent
    // toujours visibles, quel que soit le pays demandé — jamais de régression
    // de visibilité pour les annonces existantes.
    if (country && country !== "INTL") {
      const countryOr = [{ country: String(country).toUpperCase() }, { country: null }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: countryOr }];
        delete filter.$or;
      } else {
        filter.$or = countryOr;
      }
    }

    const maxLimit  = isAdmin ? 500 : 100;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), maxLimit);
    const skip  = (Math.max(Number(page), 1) - 1) * safeLimit;

    let vehicles, total;
    if (hasGeo) {
      // Recherche "près de moi" : $geoNear doit être le premier stage du pipeline,
      // trie nativement par distance croissante — on lui passe le même filtre
      // (statut/pays/prix/etc.) via son option `query`. Les véhicules sans
      // coordonnées (donc sans `location`) sont naturellement exclus par $geoNear.
      const safeRadiusKm = Math.min(Math.max(Number(radiusKm) || 50, 1), 500);
      const [result] = await Vehicle.aggregate([
        {
          $geoNear: {
            near:          { type: "Point", coordinates: [clientLng, clientLat] },
            distanceField: "distanceKm",
            distanceMultiplier: 0.001,
            maxDistance:   safeRadiusKm * 1000,
            spherical:     true,
            query:         filter,
          },
        },
        {
          $facet: {
            data:  [{ $skip: skip }, { $limit: safeLimit }],
            count: [{ $count: "total" }],
          },
        },
      ]);
      vehicles = result?.data || [];
      total    = result?.count?.[0]?.total || 0;

      // populate() n'existe pas en aggregation — hydrater owner manuellement.
      const User = (await import("../models/User.js")).default;
      const ownerIds = [...new Set(vehicles.map((v) => v.owner?.toString()).filter(Boolean))];
      const owners = await User.find({ _id: { $in: ownerIds } })
        .select("firstName phone ville certificationBadge")
        .lean();
      const ownerMap = Object.fromEntries(owners.map((o) => [o._id.toString(), o]));
      vehicles = vehicles.map((v) => limitVehicleImages({ ...v, owner: ownerMap[v.owner?.toString()] || v.owner, distanceKm: Math.round(v.distanceKm * 10) / 10 }));
    } else {
      [vehicles, total] = await Promise.all([
        Vehicle.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
          .populate("owner", "firstName phone ville certificationBadge")
          .lean(),
        Vehicle.countDocuments(filter),
      ]);
      vehicles = vehicles.map((v) => limitVehicleImages(v));
    }

    const payload = { vehicles, total, page: Number(page), pages: Math.ceil(total / safeLimit) };
    if (cacheKey) cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    logger.error("getVehicles:", err);
    res.status(500).json({ message: "Erreur récupération véhicules." });
  }
};

// ── Détail d'un véhicule par ID (public) ─────────────────────────────────────
export const getVehicleById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Véhicule introuvable." });
    }
    const ownerFields = req.user?.role === "admin"
      ? "firstName lastName email phone profilePhoto role isActive kycStatus certificationBadge createdAt ville"
      : "firstName lastName phone ville certificationBadge";
    const vehicle = await Vehicle.findById(id).populate("owner", ownerFields).lean();
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });
    // Masquer les véhicules non approuvés aux non-admins
    if (vehicle.status !== "approved" && req.user?.role !== "admin" && vehicle.owner?._id?.toString() !== req.user?._id?.toString()) {
      return res.status(404).json({ message: "Véhicule introuvable." });
    }
    res.json({ vehicle });
  } catch (err) {
    logger.error("getVehicleById:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mes annonces (partenaire connecté) ────────────────────────────────────────
export const getMyVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ owner: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ vehicles: vehicles.map((v) => limitVehicleImages(v)) });
  } catch (err) {
    logger.error("getMyVehicles:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Annonces en attente (admin) ───────────────────────────────────────────────
export const getPendingVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .populate("owner", "firstName lastName email phone")
      .lean();
    res.json({ vehicles: vehicles.map((v) => limitVehicleImages(v)) });
  } catch (err) {
    logger.error("getPendingVehicles:", err);
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
    logger.error("updateVehicleStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

// ── PATCH /api/vehicles/:id/lifecycle — transitions PARTENAIRE (pas de modération) ──
// Distinct de updateVehicleStatus (admin uniquement, approuver/rejeter) : un
// partenaire peut mettre une annonce en brouillon, la marquer vendue ou
// l'archiver sans jamais passer par un admin — et sans devoir la SUPPRIMER
// définitivement (DELETE /:id reste possible mais casse l'historique des
// réservations liées, une annonce supprimée n'étant plus jamais consultable).
export const updateVehicleLifecycle = async (req, res) => {
  try {
    const { status } = req.body;
    const OWNER_ALLOWED = ["draft", "sold", "archived", "pending"];
    if (!OWNER_ALLOWED.includes(status)) {
      return res.status(400).json({ message: `Statut invalide. Valeurs acceptées : ${OWNER_ALLOWED.join(", ")}.` });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    // "pending" = remise en vente depuis un brouillon : redemande une revue
    // admin (cohérent avec la modération normale, jamais republiée directement
    // "approved" par le partenaire lui-même).
    if (status === "pending" && !["draft", "archived"].includes(vehicle.status)) {
      return res.status(400).json({ message: "Seule une annonce en brouillon ou archivée peut être remise en vente." });
    }

    vehicle.status = status;
    vehicle.available = false; // approbation admin requise avant de redevenir visible/réservable
    vehicle.statusHistory.push({ status, changedAt: new Date(), changedBy: req.user._id });
    await vehicle.save();

    res.json({ vehicle });
  } catch (err) {
    logger.error("updateVehicleLifecycle:", err);
    res.status(500).json({ message: "Erreur mise à jour du statut." });
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

    // Whitelist des champs modifiables (évite le mass assignment sur owner, stats, etc.)
    const EDITABLE = [
      "title", "marque", "modele", "annee", "couleur", "kilometrage", "etat",
      "vehicleType", "carburant", "transmission", "nombrePlaces", "nombrePortes",
      "climatisation", "withDriver", "pricePerDay", "priceForSale", "caution",
      "rentalDurationType",
      "leasing", "credit", "ageMin", "permisRequis", "assuranceOptionnelle",
      "contactNom", "contactTel", "ville", "adresse", "coordonnees", "country",
      "images", "thumbnail", "description", "available", "type",
    ];
    // Champs réservés admin
    const ADMIN_ONLY = ["featured", "sponsoredUntil", "boostLevel"];
    if (req.body.images) req.body.images = req.body.images.slice(0, 8);
    if (req.body.images || req.body.thumbnail) {
      const imagesError = validateVehicleImages([...(req.body.images || []), req.body.thumbnail].filter(Boolean));
      if (imagesError) return res.status(400).json({ message: imagesError });
    }

    const safeUpdate = {};
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) safeUpdate[key] = req.body[key];
    }
    // Admin peut aussi modifier les champs réservés
    if (req.user.role === "admin") {
      for (const key of ADMIN_ONLY) {
        if (req.body[key] !== undefined) safeUpdate[key] = req.body[key];
      }
    }

    // Si un partenaire modifie, re-valider et recalculer le statut
    if (isOwner && req.user.role !== "admin") {
      const validation = scoreAnnonce({ ...vehicle.toObject(), ...safeUpdate });
      safeUpdate.status             = validation.status;
      safeUpdate.available          = validation.status === "approved";
      safeUpdate.validationScore    = validation.score;
      safeUpdate.validationErrors   = validation.errors;
      safeUpdate.validationWarnings = validation.warnings;
      safeUpdate.rejectionReason    = validation.status === "rejected"
        ? validation.errors.join(". ")
        : null;
    }

    const updated = await Vehicle.findByIdAndUpdate(req.params.id, safeUpdate, { new: true, runValidators: true });
    res.json({ vehicle: updated });
  } catch (err) {
    logger.error("updateVehicle:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

// ── Conversion d'une annonce véhicule (location/vente) en annonce export ────
// Deux modèles Mongo distincts (Vehicle / ImportExportListing) — impossible de
// simplement changer un champ `type`. On crée une nouvelle ImportExportListing
// à partir des données du véhicule (soumise à modération comme toute annonce
// export) et on archive le véhicule d'origine (jamais supprimé : conserve
// l'historique des réservations déjà passées dessus).
const VEHICLE_FUEL_TO_IE = { Essence: "essence", Diesel: "diesel", Hybride: "hybride", "Électrique": "electrique", GPL: "gpl" };
const VEHICLE_TRANS_TO_IE = { Automatique: "automatique", Manuelle: "manuelle" };
const VEHICLE_ETAT_TO_IE = { "Neuf": "neuf", "Comme neuf": "occasion", "Bon état": "occasion", "À réparer": "occasion" };

export const convertVehicleToExport = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isAdmin = req.user.role === "admin";
    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) return res.status(403).json({ message: "Accès refusé." });

    // Mêmes garde-fous que la création directe d'une annonce export (voir
    // importExportController.createListing) — cette conversion est une autre
    // porte d'entrée vers le même système, elle ne doit pas le contourner.
    const ownerUser = isOwner ? req.user : await User.findById(vehicle.owner);
    if (!ownerUser?.isFounder) {
      return res.status(403).json({
        code: "FOUNDING_PARTNER_REQUIRED",
        message: "Le propriétaire doit être Founding Partner pour publier une annonce d'export.",
      });
    }
    const suspendedVerif = await PartnerVerification.findOne({
      userId: ownerUser._id,
      status: { $in: ["suspendu", "rejete"] },
    }).select("status").lean();
    if (suspendedVerif) {
      return res.status(403).json({
        code: "PARTNER_SUSPENDED",
        message: "Dossier partenaire suspendu ou rejeté — impossible de publier une annonce export.",
      });
    }

    const { price, currency, availableIn, sourceCity } = req.body;
    if (!price || Number(price) <= 0) {
      return res.status(400).json({ message: "Un prix d'export est requis." });
    }
    if (!Array.isArray(availableIn) || availableIn.length === 0) {
      return res.status(400).json({ message: "Indiquez au moins un pays de destination (livraison disponible vers)." });
    }

    const importerProfile = await ensureImporterProfile(ownerUser);
    const listing = await ImportExportListing.create({
      partner: vehicle.owner,
      importerProfile: importerProfile._id,
      convertedFromVehicle: vehicle._id,
      title: vehicle.title,
      make: vehicle.marque, model: vehicle.modele, year: vehicle.annee || new Date().getFullYear(),
      mileage: vehicle.kilometrage || 0,
      fuelType: VEHICLE_FUEL_TO_IE[vehicle.carburant] || "autre",
      transmission: VEHICLE_TRANS_TO_IE[vehicle.transmission] || "automatique",
      bodyType: vehicle.vehicleType || "",
      color: vehicle.couleur || "",
      condition: VEHICLE_ETAT_TO_IE[vehicle.etat] || "occasion",
      description: vehicle.description || "",
      sourceCountry: COUNTRY_CODE_TO_NAME[vehicle.country] || vehicle.ville || vehicle.country || "Côte d'Ivoire",
      sourceCity: sourceCity || vehicle.ville || "",
      availableIn,
      price: Number(price),
      currency: currency || "XOF",
      photos: vehicle.images || [],
      mainPhoto: vehicle.thumbnail || vehicle.images?.[0] || null,
      status: "pending",
    });

    vehicle.status = "archived";
    vehicle.available = false;
    vehicle.statusHistory.push({ status: "archived", changedBy: req.user._id });
    await vehicle.save();

    res.json({ listing, vehicle });
  } catch (err) {
    logger.error("convertVehicleToExport:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur lors de la conversion." });
  }
};

// ── Promotion partenaire (ex: "-15% aujourd'hui") ─────────────────────────────
// Endpoint dédié, séparé de updateVehicle : une promotion ne doit jamais
// déclencher une re-validation/re-modération de l'annonce.
export const updatePromotion = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const isOwner = vehicle.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const { active, discountPercent, label, startDate, endDate } = req.body;

    const pct = Number(discountPercent);
    if (active && (!Number.isFinite(pct) || pct <= 0 || pct > 90)) {
      return res.status(400).json({ message: "Le pourcentage de remise doit être compris entre 1 et 90." });
    }
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ message: "La date de fin doit être postérieure à la date de début." });
    }

    vehicle.promotion = {
      active:          !!active,
      discountPercent: active ? pct : 0,
      label:           (label || "").slice(0, 60),
      startDate:       startDate || null,
      endDate:         endDate   || null,
    };
    await vehicle.save();

    res.json({ vehicle });
  } catch (err) {
    logger.error("updatePromotion:", err);
    res.status(500).json({ message: "Erreur mise à jour de la promotion." });
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
    // Journal d'audit global — uniquement quand un admin supprime l'annonce d'un
    // autre utilisateur (suppression par le propriétaire lui-même = action normale)
    if (req.user.role === "admin" && !isOwner) {
      await logAction(req, "vehicle.admin_delete", "Vehicle", req.params.id, {
        before: { title: vehicle.title, owner: vehicle.owner },
      });
    }
    res.json({ message: "Annonce supprimée." });
  } catch (err) {
    logger.error("deleteVehicle:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// DISPONIBILITÉ AUTOMATIQUE — Vérifie si un véhicule est occupé aujourd'hui
// Appelée par GET /api/vehicles/:id/availability
// ══════════════════════════════════════════════════════════════════════════════
export const getVehicleAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const vehicle = await Vehicle.findById(id).select("title type available owner");
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "transaction_concluded", "waiting_client_validation",
    ];

    // Vérifier s'il y a un conflit sur la plage demandée (ou aujourd'hui si pas de dates)
    const start = startDate ? new Date(startDate) : today;
    const end   = endDate   ? new Date(endDate)   : new Date(today.getTime() + 86400000);

    const conflict = await Booking.findOne({
      vehicle: id,
      status:  { $in: activeStatuses },
      "location.startDate": { $lt: end },
      "location.endDate":   { $gt: start },
    }).select("reference status location.startDate location.endDate -_id");

    const isOccupied = !!conflict;

    // Synchroniser le champ available si nécessaire
    if (vehicle.type === "location" && vehicle.available === isOccupied) {
      await Vehicle.findByIdAndUpdate(id, { available: !isOccupied });
    }

    res.json({
      vehicleId:   id,
      available:   !isOccupied,
      isOccupied,
      conflict:    conflict ? {
        reference:  conflict.reference,
        status:     conflict.status,
        startDate:  conflict.location?.startDate,
        endDate:    conflict.location?.endDate,
      } : null,
      checkedRange: { start, end },
    });
  } catch (err) {
    logger.error("getVehicleAvailability:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SYNCHRONISATION GLOBALE — Met à jour la disponibilité de tous les véhicules
// Appelée par POST /api/vehicles/sync-availability (admin)
// ══════════════════════════════════════════════════════════════════════════════
export const syncAllAvailability = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "transaction_concluded", "waiting_client_validation",
    ];

    // Trouver tous les véhicules location
    const vehicles = await Vehicle.find({ type: "location" }).select("_id available").lean();

    // Pour chaque véhicule, vérifier s'il a un booking actif aujourd'hui
    const activeBookings = await Booking.find({
      status:  { $in: activeStatuses },
      "location.startDate": { $lt: tomorrow },
      "location.endDate":   { $gt: today },
    }).select("vehicle -_id").lean();

    const occupiedIds = new Set(activeBookings.map((b) => b.vehicle?.toString()));

    // bulkWrite en un seul aller-retour Mongo au lieu d'un findByIdAndUpdate séquentiel
    // par véhicule — et on n'écrit que les documents dont la valeur change réellement.
    const ops = [];
    for (const v of vehicles) {
      const shouldBeAvailable = !occupiedIds.has(v._id.toString());
      if (v.available !== shouldBeAvailable) {
        ops.push({ updateOne: { filter: { _id: v._id }, update: { $set: { available: shouldBeAvailable } } } });
      }
    }
    if (ops.length) await Vehicle.bulkWrite(ops);

    res.json({
      message: `Synchronisation terminée : ${ops.length} véhicule(s) mis à jour.`,
      total:    vehicles.length,
      occupied: occupiedIds.size,
      updated:  ops.length,
    });
  } catch (err) {
    logger.error("syncAllAvailability:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
