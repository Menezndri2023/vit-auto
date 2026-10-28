import { Router } from "express";
import { authenticate as protect, authorizeAdmin, requireGeneralAdmin, requireAnyAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  adminList,
  adminStats,
  adminGetOne,
  adminCreate,
  adminUpdate,
  adminUpdateStatut,
  adminLink,
  adminDelete,
  adminAddEchange,
} from "../controllers/partnerCrmController.js";

const router = Router();

// Portée « partners » (Onboarding, certification, vérification, CRM — voir
// constants/adminScopes.js) : un admin KYC ou support n'a pas à lire le
// pipeline commercial. L'admin général passe toujours.
const isAdmin = [protect, authorizeAdmin, requireAnyAdminScope("partners")];

router.get   ("/admin/list",          isAdmin, adminList);
router.get   ("/admin/stats",         isAdmin, adminStats);
router.get   ("/admin/:id",           isAdmin, validateObjectId(), adminGetOne);
router.post  ("/admin",               isAdmin, adminCreate);
router.patch ("/admin/:id",           isAdmin, validateObjectId(), adminUpdate);
router.patch ("/admin/:id/statut",    isAdmin, validateObjectId(), adminUpdateStatut);
router.patch ("/admin/:id/link",      isAdmin, validateObjectId(), adminLink);
router.post  ("/admin/:id/echanges",  isAdmin, validateObjectId(), adminAddEchange);
// Suppression réservée au super admin — nettoyage de doublons, pas un usage courant.
// Suppression d'un prospect : action irréversible réservée à
// l'administrateur général (requireGeneralAdmin exprime cette intention
// directement, au lieu de passer "super_admin" comme un domaine parmi les
// autres — ce n'est pas un domaine, c'est un niveau).
router.delete("/admin/:id", protect, authorizeAdmin, requireGeneralAdmin, validateObjectId(), adminDelete);

export default router;
