import express from "express";
import * as ie from "../controllers/importExportController.js";
import * as tx from "../controllers/ieTransactionController.js";
import { authenticate, authorizeAdmin, optionalAuth, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();
const ieScope = requireAdminScope("import_export");

// ── Statistiques globales (admin) ─────────────────────────────────────────────
router.get("/stats", authenticate, authorizeAdmin, ieScope, ie.getStats);

// ── Demandes client (formulaire public) ───────────────────────────────────────
router.post  ("/requests",             optionalAuth,                            ie.createRequest);
router.get   ("/requests",             authenticate, authorizeAdmin, ieScope,            ie.getRequests);
router.patch ("/requests/:id/status",  authenticate, authorizeAdmin, ieScope, vid,       ie.updateRequestStatus);
router.delete("/requests/:id",         authenticate, authorizeAdmin, ieScope, vid,       ie.deleteRequest);

// ── Profil importateur partenaire ─────────────────────────────────────────────
router.get   ("/importer-profile",              authenticate,                   ie.getMyImporterProfile);
router.post  ("/importer-profile",              authenticate,                   ie.submitImporterProfile);
router.get   ("/importer-profiles",             authenticate, authorizeAdmin, ieScope,   ie.getImporterProfiles);
router.get   ("/importer-profiles/:id",         authenticate, authorizeAdmin, ieScope, vid, ie.getImporterProfileById);
router.patch ("/importer-profiles/:id/review",  authenticate, authorizeAdmin, ieScope, vid, ie.reviewImporterProfile);

// ── Annonces import/export ────────────────────────────────────────────────────
router.get   ("/listings/admin",   authenticate, authorizeAdmin, ieScope,                ie.getAdminListings);
router.get   ("/listings/mine",    authenticate,                                ie.getMyListings);
router.get   ("/listings",         optionalAuth,                                ie.getListings);
router.get   ("/listings/:id",     optionalAuth,                       vid,     ie.getListingById);
router.post  ("/listings",         authenticate,                                ie.createListing);
router.put   ("/listings/:id",     authenticate,                       vid,     ie.updateListing);
router.patch ("/listings/:id/status", authenticate, authorizeAdmin, ieScope,    vid,     ie.updateListingStatus);
router.delete("/listings/:id",     authenticate,                       vid,     ie.deleteListing);

// ── Rapport d'inspection fournisseur ─────────────────────────────────────────
router.get   ("/listings/:id/inspection-report",  optionalAuth,        vid,     tx.getInspectionReport);
router.post  ("/listings/:id/inspection-report",  authenticate,        vid,     tx.createInspectionReport);

// ── Transactions (cycle de vie 14 étapes) ────────────────────────────────────
router.get   ("/transactions",          authenticate, authorizeAdmin, ieScope,            tx.getAllTransactions);
// ── Logistique : assignation transitaire/agent (restructuration 2026-09) ──
router.get   ("/transactions/assigned",            authenticate,                                     tx.getAssignedTransactions);
router.get   ("/transitaires",                     authenticate, authorizeAdmin, ieScope,            tx.getTransitairesList);
router.get   ("/agents",                           authenticate, authorizeAdmin, ieScope,            tx.getInternalAgents);
router.patch ("/transactions/:id/assign",          authenticate, authorizeAdmin, ieScope, vid,        tx.assignTransaction);
router.get   ("/transactions/mine",     authenticate,                            tx.getClientTransactions);
router.get   ("/transactions/partner",  authenticate,                            tx.getPartnerTransactions);
router.get   ("/transactions/partner/analytics", authenticate,                   tx.getPartnerIEAnalytics);
router.get   ("/transactions/partner/export",    authenticate,                   tx.exportPartnerIETransactions);
// Gate admin obligatoire (audit 2026-08) — routes statiques AVANT "/:id".
router.get   ("/transactions/admin/pending-validation", authenticate, authorizeAdmin, ieScope, tx.getPendingDirectPurchases);
router.patch ("/transactions/:id/admin-validate-direct", authenticate, authorizeAdmin, ieScope, vid, tx.adminValidateDirectPurchase);
router.get   ("/transactions/:id",      authenticate,                   vid,     tx.getTransactionById);
router.get   ("/transactions/:id/receipt", authenticate,                vid,     tx.getTransactionReceipt);

router.post  ("/transactions",          authenticate,                            tx.createReservation);
router.post  ("/transactions/direct-purchase", authenticate,                     tx.createDirectPurchase);
router.patch ("/transactions/:id/confirm",          authenticate,       vid,     tx.confirmReservation);
router.patch ("/transactions/:id/request-inspection", authenticate,     vid,     tx.requestIndependentInspection);
router.patch ("/transactions/:id/complete-inspection", authenticate, authorizeAdmin, ieScope, vid, tx.completeIndependentInspection);
router.post  ("/transactions/:id/final-offer",      authenticate,       vid,     tx.sendFinalOffer);
router.patch ("/transactions/:id/accept-offer",     authenticate,       vid,     tx.acceptOffer);
router.post  ("/transactions/:id/pay",              authenticate,       vid,     tx.payEscrow);
router.post  ("/transactions/:id/pay-balance",      authenticate,       vid,     tx.payInstallmentBalance);
router.patch ("/transactions/:id/verify-payment",   authenticate, authorizeAdmin, ieScope, vid, tx.confirmEscrowPayment);
router.patch ("/transactions/:id/reject-payment",   authenticate, authorizeAdmin, ieScope, vid, tx.rejectEscrowPayment);
router.patch ("/transactions/:id/documents",        authenticate,       vid,     tx.updateDocuments);
router.patch ("/transactions/:id/ship",             authenticate,       vid,     tx.markShipped);
router.patch ("/transactions/:id/tracking",         authenticate,       vid,     tx.updateTracking);
router.patch ("/transactions/:id/deliver",          authenticate,       vid,     tx.confirmDelivery);
router.patch ("/transactions/:id/release-funds",    authenticate,       vid,     tx.releaseFunds);
router.post  ("/transactions/:id/review",           authenticate,       vid,     tx.addReview);
router.post  ("/transactions/:id/dispute",          authenticate,       vid,     tx.openDispute);
router.patch ("/transactions/:id/dispute/resolve",  authenticate, authorizeAdmin, ieScope, vid, tx.resolveDispute);
router.patch ("/transactions/:id/cancel",           authenticate,       vid,     tx.cancelTransaction);

export default router;
