import express from "express";
import * as n from "../controllers/notificationController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

router.get("/", authenticate, n.getMyNotifications);
router.patch("/read-all", authenticate, n.markAllAsRead);
// Routes à segment fixe AVANT "/:id" (sinon "push-token"/"admin" seraient
// interceptés par validateObjectId comme un id invalide).
router.post("/push-token",   authenticate, n.registerPushToken);
router.delete("/push-token", authenticate, n.unregisterPushToken);
router.post("/admin/broadcast", authenticate, authorizeAdmin, n.sendAdminNotification);
router.patch("/:id/read", vid, authenticate, n.markAsRead);
router.delete("/:id",     vid, authenticate, n.deleteNotification);

export default router;
