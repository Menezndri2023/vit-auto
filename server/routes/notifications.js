import express from "express";
import * as n from "../controllers/notificationController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

router.get("/", authenticate, n.getMyNotifications);
router.patch("/read-all", authenticate, n.markAllAsRead);
// Routes à segment fixe AVANT "/:id" (sinon "push-token"/"admin" seraient
// interceptés par validateObjectId comme un id invalide).
router.post("/push-token",   authenticate, n.registerPushToken);
router.delete("/push-token", authenticate, n.unregisterPushToken);
// Diffusion à TOUTE la base (clients, partenaires, autres admins) avec la voix
// de la plateforme : le scope manquait, alors que toutes les routes admin
// sœurs (signalements, avis, WhatsApp, support) en portent un — un admin
// restreint à la modération pouvait notifier tout le monde.
router.post("/admin/broadcast", authenticate, authorizeAdmin, requireAdminScope("support"), n.sendAdminNotification);
router.patch("/:id/read", vid, authenticate, n.markAsRead);
router.delete("/:id",     vid, authenticate, n.deleteNotification);

export default router;
