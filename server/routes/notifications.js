import express from "express";
import * as n from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.get("/", authenticate, n.getMyNotifications);                           // mes notifications
router.patch("/read-all", authenticate, n.markAllAsRead);                      // tout marquer lu
router.patch("/:id/read", authenticate, n.markAsRead);                        // marquer une lu
router.delete("/:id", authenticate, n.deleteNotification);                     // supprimer

export default router;
