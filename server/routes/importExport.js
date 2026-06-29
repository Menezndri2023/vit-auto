import express from "express";
import * as ie from "../controllers/importExportController.js";
import * as tx from "../controllers/ieTransactionController.js";
import { authenticate, authorizeAdmin, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// ── Statistiques globales (admin) ─────────────────────────────────────────────
router.get("/stats", authenticate, authorizeAdmin, ie.getStats);

// ── Demandes client (formulaire public) ───────────────────────────────────────
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

// ── Rapport d'inspection fournisseur ─────────────────────────────────────────
router.get   ("/listings/:id/inspection-report",  optionalAuth,           tx.getInspectionReport);
router.post  ("/listings/:id/inspection-report",  authenticate,           tx.createInspectionReport);

// ── Transactions (cycle de vie 14 étapes) ────────────────────────────────────
// Consultation
router.get   ("/transactions",          authenticate, authorizeAdmin,      tx.getAllTransactions);
router.get   ("/transactions/mine",     authenticate,                      tx.getClientTransactions);
router.get   ("/transactions/partner",  authenticate,                      tx.getPartnerTransactions);
router.get   ("/transactions/:id",      authenticate,                      tx.getTransactionById);

// Création — étape 4
router.post  ("/transactions",          authenticate,                      tx.createReservation);

// Étape 5 — confirmation partenaire
router.patch ("/transactions/:id/confirm",          authenticate,          tx.confirmReservation);

// Étape 7 — inspection indépendante
router.patch ("/transactions/:id/request-inspection", authenticate,        tx.requestIndependentInspection);
router.patch ("/transactions/:id/complete-inspection", authenticate, authorizeAdmin, tx.completeIndependentInspection);

// Étape 8 — offre finale
router.post  ("/transactions/:id/final-offer",      authenticate,          tx.sendFinalOffer);
router.patch ("/transactions/:id/accept-offer",     authenticate,          tx.acceptOffer);

// Étape 9 — paiement escrow
router.post  ("/transactions/:id/pay",              authenticate,          tx.payEscrow);

// Étape 10 — documents
router.patch ("/transactions/:id/documents",        authenticate,          tx.updateDocuments);

// Étape 11 — expédition
router.patch ("/transactions/:id/ship",             authenticate,          tx.markShipped);
router.patch ("/transactions/:id/tracking",         authenticate,          tx.updateTracking);

// Étape 12 — livraison
router.patch ("/transactions/:id/deliver",          authenticate,          tx.confirmDelivery);

// Étape 13 — libération fonds
router.patch ("/transactions/:id/release-funds",    authenticate,          tx.releaseFunds);

// Étape 14 — évaluations
router.post  ("/transactions/:id/review",           authenticate,          tx.addReview);

// Litige
router.post  ("/transactions/:id/dispute",          authenticate,          tx.openDispute);
router.patch ("/transactions/:id/dispute/resolve",  authenticate, authorizeAdmin, tx.resolveDispute);

// Annulation
router.patch ("/transactions/:id/cancel",           authenticate,          tx.cancelTransaction);

export default router;
