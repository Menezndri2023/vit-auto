import express from "express";
import * as c from "../controllers/chatController.js";
import { authenticate } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.use(authenticate); // toutes les routes nécessitent une authentification
const vid = validateObjectId();

router.get("/",           c.getMyChats);
router.get("/unread",     c.getUnreadCount);
router.post("/",          c.getOrCreateChat);
router.get("/:id",        vid, c.getMessages);
router.post("/:id",       vid, c.sendMessage);

export default router;
