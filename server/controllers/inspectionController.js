import logger from "../utils/logger.js";
import InspectionReport from "../models/InspectionReport.js";
import Vehicle from "../models/Vehicle.js";

// Généralisation d'InspectionReport (jusque-là réservé aux annonces Import/
// Export, voir createInspectionReport/getInspectionReport dans
// ieTransactionController.js) aux véhicules du catalogue standard
// (location/vente). Même logique d'un seul rapport par cible, même contrôle
// de propriété — dupliquée plutôt que factorisée avec le contrôleur IE pour
// ne pas toucher un flux déjà en production.

// POST /api/vehicles/:id/inspection-report
export const createVehicleInspectionReport = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user._id });
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });

    const existing = await InspectionReport.findOne({ vehicle: req.params.id });
    if (existing) {
      Object.assign(existing, {
        ...req.body,
        partner: req.user._id,
        vehicle: req.params.id,
        listing: null,
        updatedAt: new Date(),
      });
      await existing.save();
      await Vehicle.findByIdAndUpdate(req.params.id, { inspectionReport: existing._id });
      return res.json({ message: "Rapport d'inspection mis à jour.", report: existing });
    }

    // req.body EN PREMIER : vehicle/partner doivent toujours venir de l'URL/
    // l'utilisateur authentifié, jamais du client (même raisonnement que
    // createInspectionReport côté IE — éviter le spoofing d'ownership).
    const report = await InspectionReport.create({
      ...req.body,
      vehicle: req.params.id,
      partner: req.user._id,
    });

    await Vehicle.findByIdAndUpdate(req.params.id, { inspectionReport: report._id });

    res.status(201).json({ message: "Rapport d'inspection publié.", report });
  } catch (err) {
    logger.error("createVehicleInspectionReport:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/vehicles/:id/inspection-report
export const getVehicleInspectionReport = async (req, res) => {
  try {
    const report = await InspectionReport.findOne({ vehicle: req.params.id, status: "published" })
      // Fuite PII/fiscale corrigée (audit sécurité 2026-09) : `business` renvoyait
      // le sous-document COMPLET — companyName, mais aussi RCCM, numéro fiscal et
      // adresse du siège — et `phone` le contact direct du partenaire, sur une
      // route PUBLIQUE. En itérant sur les annonces, on reconstituait l'annuaire
      // fiscal et téléphonique de tous les exportateurs. Le projet applique déjà
      // cette restriction ailleurs (usersController.getPublicProfile, pmsController) :
      // seul le nom commercial et le logo ont vocation à être publics.
      .populate("partner", "firstName lastName profilePhoto business.companyName business.logo");
    res.json({ report: report || null });
  } catch (err) {
    logger.error("getVehicleInspectionReport:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
