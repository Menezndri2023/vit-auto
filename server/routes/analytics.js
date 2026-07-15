import { Router } from "express";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { getAnalytics } from "../controllers/analyticsController.js";

const router = Router();

router.get("/admin", authenticate, authorizeAdmin, getAnalytics);

export default router;
