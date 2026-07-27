import express from "express";
import * as cl from "../controllers/commissionLedgerController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.get("/mine", authenticate, cl.getMyPayouts);

router.get("/admin", authenticate, authorizeAdmin, requireAdminScope("finance"), cl.adminListPayouts);
router.patch("/admin/:id/mark-paid", validateObjectId(), authenticate, authorizeAdmin, requireAdminScope("finance"), cl.adminMarkPaid);

export default router;
