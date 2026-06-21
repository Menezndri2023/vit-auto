import express from "express";
import * as ie from "../controllers/importExportController.js";
import { authenticate, authorizeAdmin, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// ── Statistiques globales (admin) ─────────────────────────────────────────────
router.get("/stats", authenticate, authorizeAdmin, ie.getStats);

// ── Demandes client ───────────────────────────────────────────────────────────
router.post  ("/requests",             optionalAuth,                       ie.createRequest);
router.get   ("/requests",             authenticate, authorizeAdmin,       ie.getRequests);
router.patch ("/requests/:id/status",  authenticate, authorizeAdmin,       ie.updateRequestStatus);
router.delete("/requests/:id",         authenticate, authorizeAdmin,       ie.deleteRequest);

// ── Profil importateur partenaire ─────────────────────────────────────────────
router.get   ("/importer-profile",              authenticate,              ie.getMyImporterProfile);
router.post  ("/importer-profile",              authenticate,              ie.submitImporterProfile);
router.get   ("/importer-profiles",             authenticate, authorizeAdmin, ie.getImporterProfiles);
router.get   ("/importer-profiles/:id",         authenticate, authorizeAdmin, ie.getImporterProfileById);
router.patch ("/importer-profiles/:id/review",  authenticate, authorizeAdmin, ie.reviewImporterProfile);

// ── Annonces import/export ────────────────────────────────────────────────────
router.get   ("/listings/admin",   authenticate, authorizeAdmin,           ie.getAdminListings);
router.get   ("/listings/mine",    authenticate,                           ie.getMyListings);
router.get   ("/listings",                                                  ie.getListings);
router.get   ("/listings/:id",                                              ie.getListingById);
router.post  ("/listings",         authenticate,                           ie.createListing);
router.put   ("/listings/:id",     authenticate,                           ie.updateListing);
router.patch ("/listings/:id/status", authenticate, authorizeAdmin,        ie.updateListingStatus);
router.delete("/listings/:id",     authenticate,                           ie.deleteListing);

export default router;
