import { Router } from "express";
import { authenticate as protect, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
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
} from "../controllers/partnerCrmController.js";

const router = Router();

const isAdmin = [protect, authorizeAdmin];

router.get   ("/admin/list",          isAdmin, adminList);
router.get   ("/admin/stats",         isAdmin, adminStats);
router.get   ("/admin/:id",           isAdmin, validateObjectId(), adminGetOne);
router.post  ("/admin",               isAdmin, adminCreate);
router.patch ("/admin/:id",           isAdmin, validateObjectId(), adminUpdate);
router.patch ("/admin/:id/statut",    isAdmin, validateObjectId(), adminUpdateStatut);
router.patch ("/admin/:id/link",      isAdmin, validateObjectId(), adminLink);
// Suppression réservée au super admin — nettoyage de doublons, pas un usage courant.
router.delete("/admin/:id", protect, authorizeAdmin, requireAdminScope("super_admin"), validateObjectId(), adminDelete);

export default router;
