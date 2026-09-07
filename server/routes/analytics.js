import { Router } from "express";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { getAnalytics } from "../controllers/analyticsController.js";

const router = Router();

router.get("/admin", authenticate, authorizeAdmin, requireAdminScope("finance"), getAnalytics);

export default router;
