import express from "express";
import * as wa from "../controllers/whatsappController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();
const supportScope = requireAdminScope("support");

// GET /webhook et POST /webhook sont volontairement absents d'ici : montés
// directement dans server.js, AVANT express.json() (POST doit rester en
// express.raw() pour la vérification de signature — voir server.js et le
// commentaire au-dessus des webhooks Stripe/Wave).

router.get  ("/admin/conversations",             authenticate, authorizeAdmin, supportScope,      wa.adminListConversations);
router.get  ("/admin/conversations/:id",         vid, authenticate, authorizeAdmin, supportScope, wa.adminGetConversation);
router.post ("/admin/conversations/:id/reply",   vid, authenticate, authorizeAdmin, supportScope, wa.adminReply);
router.patch("/admin/conversations/:id/status",  vid, authenticate, authorizeAdmin, supportScope, wa.adminUpdateStatus);

export default router;
