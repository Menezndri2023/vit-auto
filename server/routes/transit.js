import express from "express";
import * as t from "../controllers/transitController.js";
import { authenticate, authorizeAdmin, requireRole, requireAnyAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

// Zone Transit (2026-10-07) : prestataires logistiques inscrits sur invitation.
const router = express.Router();
const vid = validateObjectId();
const scope = requireAnyAdminScope("import_export", "transitaire");
const prestataire = requireRole("prestataire");

// Public, protégé par le jeton d'invitation (256 bits, usage unique, 7 jours)
router.get ("/invitation/:jeton", t.lireInvitation);
router.post("/inscription",       t.inscrirePrestataire);

// Admin
router.post ("/admin/invitations",            authenticate, authorizeAdmin, scope,      t.creerInvitation);
router.get  ("/admin/invitations",            authenticate, authorizeAdmin, scope,      t.listerInvitations);
router.post ("/admin/invitations/:id/revoquer", authenticate, authorizeAdmin, scope, vid, t.revoquerInvitation);
router.get  ("/admin/prestataires",           authenticate, authorizeAdmin, scope,      t.listerPrestataires);
router.patch("/admin/prestataires/:id",       authenticate, authorizeAdmin, scope, vid, t.changerStatutPrestataire);
router.post ("/admin/dossiers/:id/prestataires", authenticate, authorizeAdmin, scope, vid, t.affecterPrestataire);

// Prestataire
router.get  ("/dossiers",                  authenticate, prestataire,      t.mesDossiersTransit);
router.get  ("/dossiers/:id",              authenticate, prestataire, vid, t.lireDossierTransit);
router.post ("/dossiers/:id/etape",        authenticate, prestataire, vid, t.avancerEtapeTransit);
router.post ("/dossiers/:id/documents/:code", authenticate, prestataire, vid, t.deposerDocumentTransit);
router.patch("/dossiers/:id/expedition",   authenticate, prestataire, vid, t.majExpeditionTransit);
router.post ("/dossiers/:id/inspection",   authenticate, prestataire, vid, t.rendreRapportInspection);

export default router;
