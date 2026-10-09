import express from "express";
import * as d from "../controllers/dossierImportController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

// Dossiers d'import (2026-10-07) : suivi client + pilotage admin.
const router = express.Router();
const vid = validateObjectId();
const ieScope = requireAdminScope("import_export");

// Client (et admin en lecture)
router.get ("/mes",                      authenticate,                         d.mesDossiers);
router.get ("/referentiel",              authenticate,                         d.referentiel);
router.post("/:id/pack/declarer",        authenticate, vid,                    d.declarerReglementPack);
router.post("/:id/inspection/demander",  authenticate, vid,                    d.demanderInspection);
router.post("/:id/assurance/demander",   authenticate, vid,                    d.demanderAssurance);
router.post("/:id/assurance/accepter",   authenticate, vid,                    d.accepterAssurance);
router.post("/:id/financement/demander", authenticate, vid,                    d.demanderFinancement);
router.post("/:id/financement/annuler",  authenticate, vid,                    d.annulerFinancement);

// Admin
router.get  ("/",                        authenticate, authorizeAdmin, ieScope,      d.listerDossiers);
router.get  ("/:id",                     authenticate, vid,                          d.lireDossier);
router.patch("/:id",                     authenticate, authorizeAdmin, ieScope, vid, d.modifierDossier);
router.post ("/:id/etape",               authenticate, authorizeAdmin, ieScope, vid, d.changerEtape);
router.patch("/:id/pack",                authenticate, authorizeAdmin, ieScope, vid, d.confirmerPack);
router.post ("/:id/documents/:code",     authenticate, authorizeAdmin, ieScope, vid, d.deposerDocument);
router.post ("/:id/notes",               authenticate, authorizeAdmin, ieScope, vid, d.ajouterNote);
router.patch("/:id/inspection",          authenticate, authorizeAdmin, ieScope, vid, d.piloterInspection);
router.patch("/:id/assurance",           authenticate, authorizeAdmin, ieScope, vid, d.piloterAssurance);
router.patch("/:id/financement",         authenticate, authorizeAdmin, ieScope, vid, d.piloterFinancement);
router.post ("/:id/annuler",             authenticate, authorizeAdmin, ieScope, vid, d.annulerDossier);

export default router;
