import express from "express";
import * as ie from "../controllers/importExportController.js";
import * as tx from "../controllers/ieTransactionController.js";
import { authenticate, authorizeAdmin, optionalAuth } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

// ── Statistiques globales (admin) ─────────────────────────────────────────────
router.get("/stats", authenticate, authorizeAdmin, ie.getStats);

// ── Demandes client (formulaire public) ───────────────────────────────────────
router.post  ("/requests",             optionalAuth,                            ie.createRequest);
router.get   ("/requests",             authenticate, authorizeAdmin,            ie.getRequests);
router.patch ("/requests/:id/status",  authenticate, authorizeAdmin, vid,       ie.updateRequestStatus);
router.delete("/requests/:id",         authenticate, authorizeAdmin, vid,       ie.deleteRequest);

// ── Profil importateur partenaire ─────────────────────────────────────────────
router.get   ("/importer-profile",              authenticate,                   ie.getMyImporterProfile);
router.post  ("/importer-profile",              authenticate,                   ie.submitImporterProfile);
router.get   ("/importer-profiles",             authenticate, authorizeAdmin,   ie.getImporterProfiles);
router.get   ("/importer-profiles/:id",         authenticate, authorizeAdmin, vid, ie.getImporterProfileById);
router.patch ("/importer-profiles/:id/review",  authenticate, authorizeAdmin, vid, ie.reviewImporterProfile);

// ── Annonces import/export ────────────────────────────────────────────────────
router.get   ("/listings/admin",   authenticate, authorizeAdmin,                ie.getAdminListings);
router.get   ("/listings/mine",    authenticate,                                ie.getMyListings);
router.get   ("/listings",         optionalAuth,                                ie.getListings);
router.get   ("/listings/:id",     optionalAuth,                       vid,     ie.getListingById);
router.post  ("/listings",         authenticate,                                ie.createListing);
router.put   ("/listings/:id",     authenticate,                       vid,     ie.updateListing);
router.patch ("/listings/:id/status", authenticate, authorizeAdmin,    vid,     ie.updateListingStatus);
router.delete("/listings/:id",     authenticate,                       vid,     ie.deleteListing);

// ── Rapport d'inspection fournisseur ─────────────────────────────────────────
router.get   ("/listings/:id/inspection-report",  optionalAuth,        vid,     tx.getInspectionReport);
router.post  ("/listings/:id/inspection-report",  authenticate,        vid,     tx.createInspectionReport);

// ── Transactions (cycle de vie 14 étapes) ────────────────────────────────────
router.get   ("/transactions",          authenticate, authorizeAdmin,            tx.getAllTransactions);
router.get   ("/transactions/mine",     authenticate,                            tx.getClientTransactions);
router.get   ("/transactions/partner",  authenticate,                            tx.getPartnerTransactions);
router.get   ("/transactions/:id",      authenticate,                   vid,     tx.getTransactionById);

router.post  ("/transactions",          authenticate,                            tx.createReservation);
router.patch ("/transactions/:id/confirm",          authenticate,       vid,     tx.confirmReservation);
router.patch ("/transactions/:id/request-inspection", authenticate,     vid,     tx.requestIndependentInspection);
router.patch ("/transactions/:id/complete-inspection", authenticate, authorizeAdmin, vid, tx.completeIndependentInspection);
router.post  ("/transactions/:id/final-offer",      authenticate,       vid,     tx.sendFinalOffer);
router.patch ("/transactions/:id/accept-offer",     authenticate,       vid,     tx.acceptOffer);
router.post  ("/transactions/:id/pay",              authenticate,       vid,     tx.payEscrow);
router.patch ("/transactions/:id/verify-payment",   authenticate, authorizeAdmin, vid, tx.confirmEscrowPayment);
router.patch ("/transactions/:id/reject-payment",   authenticate, authorizeAdmin, vid, tx.rejectEscrowPayment);
router.patch ("/transactions/:id/documents",        authenticate,       vid,     tx.updateDocuments);
router.patch ("/transactions/:id/ship",             authenticate,       vid,     tx.markShipped);
router.patch ("/transactions/:id/tracking",         authenticate,       vid,     tx.updateTracking);
router.patch ("/transactions/:id/deliver",          authenticate,       vid,     tx.confirmDelivery);
router.patch ("/transactions/:id/release-funds",    authenticate,       vid,     tx.releaseFunds);
router.post  ("/transactions/:id/review",           authenticate,       vid,     tx.addReview);
router.post  ("/transactions/:id/dispute",          authenticate,       vid,     tx.openDispute);
router.patch ("/transactions/:id/dispute/resolve",  authenticate, authorizeAdmin, vid, tx.resolveDispute);
router.patch ("/transactions/:id/cancel",           authenticate,       vid,     tx.cancelTransaction);

export default router;
