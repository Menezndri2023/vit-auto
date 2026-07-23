import express from "express";
import * as pb from "../controllers/partnerBusinessController.js";
import { authenticate } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId("id");

router.get("/",               authenticate, pb.listBusinesses);
router.post("/",              authenticate, pb.createBusiness);
router.patch("/:id",          vid, authenticate, pb.updateBusiness);
router.patch("/:id/default",  vid, authenticate, pb.setDefaultBusiness);
router.delete("/:id",         vid, authenticate, pb.deleteBusiness);

export default router;
