import express from "express";
import { rateLimit } from "express-rate-limit";
import * as c from "../controllers/chatController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.use(authenticate); // toutes les routes nécessitent une authentification
const vid = validateObjectId();

// Anti-spam dédié à l'envoi de messages (le apiLimiter global sur /api/chats est
// partagé avec des usages légitimes bien plus fréquents comme le polling de la liste).
const sendMessageLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             20,
  message:         { message: "Trop de messages envoyés. Ralentissez un peu." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Anti-spam sur la création de conversation : chaque appel avec un bookingId
// différent crée un nouveau document Chat — sans limite dédiée, un compte peut
// en générer un grand nombre sous le seul apiLimiter générique (300/10min).
const createChatLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  max:             30,
  message:         { message: "Trop de conversations créées. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders:   false,
});

router.get("/",           c.getMyChats);
router.get("/unread",     c.getUnreadCount);
// Route statique AVANT "/:id" (sinon "support" serait interprété comme un :id et
// rejeté par validateObjectId).
router.get("/support",    authorizeAdmin, requireAdminScope("support"), c.getSupportChats);
router.post("/",          createChatLimiter, c.getOrCreateChat);
router.get("/:id",        vid, c.getMessages);
router.post("/:id",       vid, sendMessageLimiter, c.sendMessage);

export default router;
