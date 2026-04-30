import express from "express";
import * as c from "../controllers/contractController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/",          authenticate, c.createContract);       // créer contrat (partenaire)
router.get("/mine",       authenticate, c.getPartnerContracts);  // contrats du partenaire
router.get("/:id",        c.getContract);                        // consulter contrat (public pour signature)
router.patch("/:id/sign", c.signContract);                       // signer contrat (client, pas d'auth forcée)

export default router;
