import express from "express";
import * as c from "../controllers/chatController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate); // toutes les routes nécessitent une authentification

router.get("/",           c.getMyChats);          // mes conversations
router.get("/unread",     c.getUnreadCount);       // compteur total non-lu
router.post("/",          c.getOrCreateChat);      // obtenir ou créer une conversation
router.get("/:id",        c.getMessages);          // messages d'une conversation
router.post("/:id",       c.sendMessage);          // envoyer un message

export default router;
