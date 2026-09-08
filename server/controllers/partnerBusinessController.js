import logger from "../utils/logger.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";

// Au-delà, il s'agit probablement d'un abus (ou d'un vrai besoin qui mérite
// une discussion avec VIT AUTO plutôt qu'un formulaire libre) — large marge
// pour un partenaire multi-entités légitime.
const MAX_BUSINESSES_PER_PARTNER = 30;

const requirePartnerRole = (req, res) => {
  if (!["partenaire", "admin"].includes(req.user.role)) {
    res.status(403).json({ message: "Réservé aux partenaires." });
    return false;
  }
  return true;
};

// ── GET /api/partner/businesses ──────────────────────────────────────────────
export const listBusinesses = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;
    const businesses = await PartnerBusiness
      .find({ owner: req.user._id })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();
    res.json({ businesses });
  } catch (err) {
    logger.error("listBusinesses:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner/businesses ─────────────────────────────────────────────
export const createBusiness = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;

    const { companyName, country, ville, adresse, coordonnees, contactNom, contactTel, isDefault, isConcessionnaire } = req.body;
    if (!companyName?.trim() || !country?.trim() || !ville?.trim()) {
      return res.status(400).json({ message: "Nom de l'entreprise, pays et ville sont requis." });
    }

    const count = await PartnerBusiness.countDocuments({ owner: req.user._id });
    if (count >= MAX_BUSINESSES_PER_PARTNER) {
      return res.status(403).json({ message: `Limite de ${MAX_BUSINESSES_PER_PARTNER} entreprises atteinte. Contactez le support VIT AUTO.` });
    }

    // La toute première entreprise devient automatiquement celle par défaut.
    const makeDefault = isDefault === true || count === 0;
    if (makeDefault) {
      await PartnerBusiness.updateMany({ owner: req.user._id }, { isDefault: false });
    }

    const business = await PartnerBusiness.create({
      owner: req.user._id,
      companyName: companyName.trim(),
      country: country.trim(),
      ville: ville.trim(),
      adresse: adresse?.trim() || null,
      coordonnees: coordonnees?.lat != null && coordonnees?.lng != null
        ? { lat: Number(coordonnees.lat), lng: Number(coordonnees.lng) }
        : undefined,
      contactNom: contactNom?.trim() || null,
      contactTel: contactTel?.trim() || null,
      isDefault: makeDefault,
      isConcessionnaire: !!isConcessionnaire,
    });

    res.status(201).json({ business });
  } catch (err) {
    logger.error("createBusiness:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner/businesses/:id ───────────────────────────────────────
export const updateBusiness = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;
    const business = await PartnerBusiness.findOne({ _id: req.params.id, owner: req.user._id });
    if (!business) return res.status(404).json({ message: "Entreprise introuvable." });

    const EDITABLE = ["companyName", "country", "ville", "adresse", "coordonnees", "contactNom", "contactTel", "isConcessionnaire", "rentalPolicy"];
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) business[key] = req.body[key];
    }
    await business.save();

    res.json({ business });
  } catch (err) {
    logger.error("updateBusiness:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner/businesses/:id/default ───────────────────────────────
export const setDefaultBusiness = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;
    const business = await PartnerBusiness.findOne({ _id: req.params.id, owner: req.user._id });
    if (!business) return res.status(404).json({ message: "Entreprise introuvable." });

    await PartnerBusiness.updateMany({ owner: req.user._id }, { isDefault: false });
    business.isDefault = true;
    await business.save();

    res.json({ business });
  } catch (err) {
    logger.error("setDefaultBusiness:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── DELETE /api/partner/businesses/:id ──────────────────────────────────────
// Les annonces déjà publiées sous cette entreprise ne sont jamais supprimées
// ni bloquées — seul le rattachement (Vehicle.business) est détaché, l'annonce
// garde son pays/ville/adresse propres (déjà indépendants, voir Vehicle.js).
export const deleteBusiness = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;
    const business = await PartnerBusiness.findOne({ _id: req.params.id, owner: req.user._id });
    if (!business) return res.status(404).json({ message: "Entreprise introuvable." });

    await Vehicle.updateMany({ business: business._id }, { business: null });
    await ImportExportListing.updateMany({ business: business._id }, { business: null });
    await business.deleteOne();

    if (business.isDefault) {
      const next = await PartnerBusiness.findOne({ owner: req.user._id }).sort({ createdAt: 1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    res.json({ message: "Entreprise supprimée." });
  } catch (err) {
    logger.error("deleteBusiness:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — supervision des politiques partenaire (restructuration 2026-09)
// La politique de location (rentalPolicy — âge min, permis, ET frais de
// livraison "même ville") restait jusqu'ici réglable uniquement par le
// partenaire lui-même. L'admin peut désormais consulter/ajuster n'importe
// quelle entité, sans restriction owner (voir requirePartnerRole ci-dessus,
// non applicable ici — routes déjà gardées par authorizeAdmin).
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/businesses?search=... ─────────────────────────────────────
export const adminListBusinesses = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage  = Math.max(Number(page), 1);
    const filter = {};
    if (search) filter.companyName = new RegExp(String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const [businesses, total] = await Promise.all([
      PartnerBusiness.find(filter)
        .populate("owner", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      PartnerBusiness.countDocuments(filter),
    ]);

    res.json({ businesses, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("adminListBusinesses:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/admin/businesses/:id/rental-policy ────────────────────────────
export const adminUpdateRentalPolicy = async (req, res) => {
  try {
    const business = await PartnerBusiness.findById(req.params.id);
    if (!business) return res.status(404).json({ message: "Entreprise introuvable." });

    const EDITABLE = [
      "minimumAge", "minimumLicenseYears", "identityDocumentRequired", "drivingLicenseRequired",
      "internationalLicenseRequired", "depositRequired", "maxDeliveryRadiusKm",
      "deliveryFeeSameCity", "deliverySameCityRadiusKm", "additionalRequirements",
      // Sans cette entrée, les options du partenaire seraient silencieusement
      // ignorées quand un admin enregistre la politique depuis l'administration
      // — le formulaire afficherait « enregistré » sans rien changer.
      "rentalOptions",
    ];
    const incoming = req.body?.rentalPolicy || {};
    for (const key of EDITABLE) {
      if (incoming[key] !== undefined) business.rentalPolicy[key] = incoming[key];
    }
    await business.save();

    res.json({ business });
  } catch (err) {
    logger.error("adminUpdateRentalPolicy:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur serveur." });
  }
};
