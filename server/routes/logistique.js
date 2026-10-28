import express from "express";
import * as l from "../controllers/logistiqueController.js";
import { authenticate, authorizeAdmin, requireRole, requireAnyAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

// VIT-AUTO Logistique (2026-10-27) — mise en relation gratuite. Aucune route
// ne calcule, ne facture ni n'encaisse quoi que ce soit.
const router = express.Router();
const vid = validateObjectId("id", "devisId");
const scope = requireAnyAdminScope("import_export", "transitaire");
const prestataire = requireRole("prestataire");

// Admin
router.get  ("/admin/indicateurs",               authenticate, authorizeAdmin, scope,      l.indicateurs);
router.get  ("/admin/indicateurs.csv",           authenticate, authorizeAdmin, scope,      l.exporterIndicateurs);
router.get  ("/admin/demandes",                  authenticate, authorizeAdmin, scope,      l.listerDemandesAdmin);
router.get  ("/admin/demandes/:id",              authenticate, authorizeAdmin, scope, vid, l.lireDemandeAdmin);
router.post ("/admin/demandes/:id/qualifier",    authenticate, authorizeAdmin, scope, vid, l.qualifierDemande);
router.get  ("/admin/demandes/:id/compatibles",  authenticate, authorizeAdmin, scope, vid, l.prestatairesCompatibles);
router.post ("/admin/demandes/:id/solliciter",   authenticate, authorizeAdmin, scope, vid, l.solliciterPrestataires);
router.post ("/admin/demandes/:id/intervention", authenticate, authorizeAdmin, scope, vid, l.interventionAdmin);
router.patch("/admin/demandes/:id/note",         authenticate, authorizeAdmin, scope, vid, l.noterDemande);

// Prestataire (seules les demandes où il est sollicité)
router.get  ("/prestataire/demandes",                        authenticate, prestataire,      l.demandesPrestataire);
router.get  ("/prestataire/demandes/:id",                    authenticate, prestataire, vid, l.lireDemandePrestataire);
router.post ("/prestataire/demandes/:id/reponse",            authenticate, prestataire, vid, l.repondreSollicitation);
router.post ("/prestataire/demandes/:id/devis",              authenticate, prestataire, vid, l.soumettreDevis);
router.post ("/prestataire/demandes/:id/devis/:devisId/retirer", authenticate, prestataire, vid, l.retirerDevis);
router.post ("/prestataire/demandes/:id/etape",              authenticate, prestataire, vid, l.avancerEtape);
router.post ("/prestataire/demandes/:id/preuve",             authenticate, prestataire, vid, l.deposerPreuveLivraison);
router.post ("/prestataire/demandes/:id/documents",          authenticate, prestataire, vid, l.deposerDocumentPrestataire);

// Vendeur / exportateur de la commande liée (tout utilisateur connecté ; le
// contrôleur ne montre que les dossiers où il est le vendeur)
router.get  ("/vendeur/demandes",                   authenticate,      l.demandesVendeur);
router.get  ("/vendeur/demandes/:id",               authenticate, vid, l.lireDemandeVendeur);
router.post ("/vendeur/demandes/:id/enlevement",    authenticate, vid, l.confirmerEnlevement);
router.post ("/vendeur/demandes/:id/documents",     authenticate, vid, l.deposerDocumentVendeur);

// Client (connexion obligatoire, comme pour tout service)
router.get  ("/commandes-rattachables",             authenticate,      l.commandesRattachables);
router.post ("/demandes",                           authenticate,      l.creerDemande);
router.get  ("/demandes",                           authenticate,      l.mesDemandes);
router.get  ("/demandes/:id",                       authenticate, vid, l.lireDemandeClient);
router.patch("/demandes/:id",                       authenticate, vid, l.completerDemande);
router.post ("/demandes/:id/devis/:devisId/accepter", authenticate, vid, l.accepterDevis);
router.post ("/demandes/:id/devis/:devisId/refuser",  authenticate, vid, l.refuserDevis);
router.post ("/demandes/:id/annuler",               authenticate, vid, l.annulerDemande);
router.post ("/demandes/:id/confirmer-livraison",   authenticate, vid, l.confirmerLivraison);
router.post ("/demandes/:id/litige",                authenticate, vid, l.ouvrirLitige);
router.post ("/demandes/:id/roles",                 authenticate, vid, l.definirRoles);
router.post ("/demandes/:id/documents",             authenticate, vid, l.deposerDocumentClient);

export default router;
