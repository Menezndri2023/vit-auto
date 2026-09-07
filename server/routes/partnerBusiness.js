import express from "express";
import * as pb from "../controllers/partnerBusinessController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId("id");

router.get("/",               authenticate, pb.listBusinesses);
router.post("/",              authenticate, pb.createBusiness);
router.patch("/:id",          vid, authenticate, pb.updateBusiness);
router.patch("/:id/default",  vid, authenticate, pb.setDefaultBusiness);
router.delete("/:id",         vid, authenticate, pb.deleteBusiness);

// ── Admin — supervision des politiques partenaire (restructuration 2026-09) ──
// Routes statiques ("/admin") déclarées AVANT "/:id" pour ne jamais être
// capturées par le paramètre :id (même règle que ailleurs, voir importExport.js).
router.get("/admin",                    authenticate, authorizeAdmin, pb.adminListBusinesses);
router.patch("/:id/admin-rental-policy", vid, authenticate, authorizeAdmin, pb.adminUpdateRentalPolicy);

export default router;
