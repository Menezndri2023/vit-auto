import express from "express";
import * as v from "../controllers/vehicleController.js";
import { createVehicleInspectionReport, getVehicleInspectionReport } from "../controllers/inspectionController.js";
import { authorizeAdmin, optionalAuth, requireAdminScope } from "../middleware/auth.js";
// `authenticate` provient de middleware/team.js et non de middleware/auth.js :
// il enchaîne l'authentification habituelle avec la délégation d'accès des
// comptes d'équipe (un agent travaille sur les annonces et les réservations de
// son employeur). Cette délégation est montée ICI et sur les réservations
// UNIQUEMENT — jamais sur /api/auth ni /api/users, où elle donnerait à un agent
// la main sur le compte de son employeur.
//
// Sans compte d'équipe — le cas de tous les comptes aujourd'hui — le second
// maillon ressort immédiatement et le comportement est identique à avant.
import { authenticateEtDeleguer as authenticate } from "../middleware/team.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();
const logVid = validateObjectId("logId");

// ── IMPORTANT : routes statiques AVANT les routes paramétrées ────────────────

// ── Public (optionalAuth pour que les admins puissent filtrer par statut) ────
router.get("/", optionalAuth, v.getVehicles);                                // tous les véhicules approuvés
router.get("/public-stats", v.getPublicStats);                              // chiffres affichés sur la page d'accueil

// ── Partenaire authentifié — routes statiques ─────────────
router.get("/mine",    authenticate, v.getMyVehicles);                       // mes annonces
router.post("/",       authenticate, v.createVehicle);                       // créer une annonce
router.post("/bulk-delete", authenticate, v.bulkDeleteVehicles);             // supprimer plusieurs annonces (sélection)
router.post("/bulk-update", authenticate, v.bulkUpdateVehicles);            // ajuster prix / pause dispo (sélection)

// ── Admin — routes statiques ──────────────────────────────
// Scope "catalogue" ajouté (audit sécurité 2026-09) : ces 4 routes admin en
// étaient dépourvues, alors que leurs homologues chauffeurs et les backfill
// du même fichier l'ont. Un admin restreint à un autre secteur pouvait donc
// lister les annonces en modération AVEC l'e-mail et le téléphone de chaque
// partenaire, les approuver ou les rejeter, et se réassigner une annonce.
router.get("/pending", authenticate, authorizeAdmin, requireAdminScope("catalogue"), v.getPendingVehicles);
router.post("/sync-availability", authenticate, authorizeAdmin, requireAdminScope("catalogue"), v.syncAllAvailability);
router.post("/backfill-thumbnails", authenticate, authorizeAdmin, requireAdminScope("catalogue"), v.backfillThumbnails);
router.post("/backfill-descriptions", authenticate, authorizeAdmin, requireAdminScope("catalogue"), v.backfillDescriptions);

// ── Routes paramétrées (viennent APRÈS les routes statiques) ─────────────────
router.get("/:id/availability", vid, optionalAuth, v.getVehicleAvailability);    // disponibilité dates
router.get("/:id/rental-conditions", vid, optionalAuth, v.getVehicleRentalConditions); // options et conditions du partenaire
router.get("/:id/inspection-report",  vid, optionalAuth,  getVehicleInspectionReport);   // rapport d'inspection (public)
router.post("/:id/inspection-report", vid, authenticate,  createVehicleInspectionReport); // publié/mis à jour par le propriétaire
router.patch("/:id/status",   vid, authenticate, authorizeAdmin, requireAdminScope("catalogue"), v.updateVehicleStatus); // approuver/rejeter
router.patch("/:id/transfer", vid, authenticate, authorizeAdmin, requireAdminScope("catalogue"), v.transferVehicle); // réassigner compte/entreprise/pays/ville (admin)
router.patch("/:id/lifecycle",vid, authenticate, v.updateVehicleLifecycle);               // brouillon/vendu/archivé (partenaire)
router.patch("/:id/promotion",vid, authenticate, v.updatePromotion);                      // activer/désactiver une promotion
router.patch("/:id/seasonal-rates", vid, authenticate, v.updateSeasonalRates);            // tarifs saisonniers (haute/basse saison)
router.post("/:id/convert-to-export", vid, authenticate, v.convertVehicleToExport);       // transforme en annonce Import/Export
router.post("/:id/generate-description", vid, authenticate, v.generateDescription);       // description automatique (propriétaire/admin)
router.get("/:id/maintenance",              vid, authenticate, v.getMaintenanceLogs);     // journal entretien/incident/dommage
router.post("/:id/maintenance",             vid, authenticate, v.addMaintenanceLog);
router.delete("/:id/maintenance/:logId", vid, logVid, authenticate, v.deleteMaintenanceLog);
router.patch("/:id",          vid, authenticate, v.updateVehicle);                        // mise à jour partielle (featured, etc.)
router.put("/:id",            vid, authenticate, v.updateVehicle);                        // modifier annonce (compat)
router.delete("/:id", vid, authenticate, v.deleteVehicle);                        // supprimer annonce
router.get("/:id",    vid, optionalAuth,  v.getVehicleById);                      // détail véhicule (public)

export default router;
