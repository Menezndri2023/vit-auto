import express from "express";
import * as n from "../controllers/notificationController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

router.get("/", authenticate, n.getMyNotifications);
router.patch("/read-all", authenticate, n.markAllAsRead);
router.patch("/:id/read", vid, authenticate, n.markAsRead);
router.delete("/:id",     vid, authenticate, n.deleteNotification);
router.post("/admin/broadcast", authenticate, authorizeAdmin, n.sendAdminNotification);

export default router;
