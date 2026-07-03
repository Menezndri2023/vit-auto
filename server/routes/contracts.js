import express from "express";
import * as c from "../controllers/contractController.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { generateContractPDF } from "../utils/pdfGenerator.js";
import Contract from "../models/Contract.js";

const router = express.Router();
const vid = validateObjectId();

router.post("/",          authenticate,  c.createContract);
router.get("/mine",       authenticate,  c.getPartnerContracts);
router.get("/:id",        vid, optionalAuth,  c.getContract);
router.patch("/:id/sign", vid, optionalAuth,  c.signContract);

// ── PDF contrat téléchargeable ────────────────────────────
router.get("/:id/pdf",    vid, optionalAuth,  async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id).populate("booking");
    if (!contract) {
      // Chercher par bookingId
      const byBooking = await Contract.findOne({ booking: req.params.id }).populate("booking");
      if (!byBooking) return res.status(404).json({ message: "Contrat introuvable." });
      return generateContractPDF(byBooking, res);
    }
    generateContractPDF(contract, res);
  } catch { res.status(500).json({ message: "Erreur génération PDF." }); }
});

export default router;
