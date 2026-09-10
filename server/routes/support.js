import express from "express";
import {
  createTicket, getMyTickets, getTicket, replyToTicket,
  adminListTickets, adminUpdateTicket,
} from "../controllers/supportController.js";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// L'assistance reste ouverte à TOUT compte authentifié : ce que l'abonnement
// achète est la priorité de traitement et le délai annoncé, pas le droit
// d'écrire au support. Fermer le canal aux comptes gratuits transformerait un
// avantage commercial en rétention d'assistance.
router.post("/tickets",              protect, createTicket);
router.get("/tickets",               protect, getMyTickets);
router.get("/tickets/:id",           protect, validateObjectId("id"), getTicket);
router.post("/tickets/:id/messages", protect, validateObjectId("id"), replyToTicket);

// Admin — la file de traitement, ordonnée par échéance de réponse.
router.get("/admin/tickets",       protect, authorizeAdmin, adminListTickets);
router.patch("/admin/tickets/:id", protect, authorizeAdmin, validateObjectId("id"), adminUpdateTicket);

export default router;
