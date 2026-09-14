import express from "express";
import { mesSecteurs, demanderSecteur, adminListerDemandes, adminTraiterDemande } from "../controllers/partnerSectorController.js";
import { authenticate as protect, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.get("/me",       protect, mesSecteurs);
router.post("/requests", protect, demanderSecteur);

// L'ajout d'un secteur relève de la vérification partenaire : même portée
// d'administration que le dossier d'onboarding.
router.get("/admin/requests",           protect, authorizeAdmin, requireAdminScope("partners"), adminListerDemandes);
router.patch("/admin/requests/:id",     protect, authorizeAdmin, requireAdminScope("partners"), validateObjectId("id"), adminTraiterDemande);

export default router;
