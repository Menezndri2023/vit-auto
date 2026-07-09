import express from "express";
import * as c from "../controllers/contractController.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { generateContractPDF } from "../utils/pdfGenerator.js";
import Contract from "../models/Contract.js";
import logger from "../utils/logger.js";

const router = express.Router();
const vid = validateObjectId();

router.post("/",          authenticate,  c.createContract);
router.get("/mine",       authenticate,  c.getPartnerContracts);
// authenticate (pas optionalAuth) : getContract/signContract vérifient l'ownership,
// il faut donc un req.user résolu — accès non authentifié = accès refusé (cf. canAccessContract).
router.get("/:id",        vid, authenticate,  c.getContract);
router.patch("/:id/sign", vid, optionalAuth,  c.signContract); // signContract autorise aussi par email (réservation invité)

// ── PDF contrat téléchargeable (même contrôle d'accès que getContract) ───
router.get("/:id/pdf",    vid, authenticate,  async (req, res) => {
  try {
    let contract = await Contract.findById(req.params.id).populate("booking");
    if (!contract) {
      // Chercher par bookingId
      contract = await Contract.findOne({ booking: req.params.id }).populate("booking");
    }
    if (!contract) return res.status(404).json({ message: "Contrat introuvable." });

    if (!(await c.canAccessContract(contract, req.user))) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    generateContractPDF(contract, res);
  } catch (err) {
    logger.error("GET /contracts/:id/pdf:", err);
    res.status(500).json({ message: "Erreur génération PDF." });
  }
});

export default router;
