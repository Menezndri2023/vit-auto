import express from "express";
import { listKeys, createKey, revokeKey } from "../controllers/apiKeyController.js";
import { authenticate as protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { exigeFonctionnalite } from "../services/planAccess.js";

const router = express.Router();

// Un membre d'équipe ne crée pas de clé d'API : une clé engage le compte du
// titulaire bien au-delà de la durée de sa présence dans l'entreprise.
const seulementTitulaire = (req, res, next) => {
  if (req.user?.teamOf) {
    return res.status(403).json({ message: "Seul le titulaire du compte peut gérer les clés d'API." });
  }
  next();
};

router.use(protect, seulementTitulaire, exigeFonctionnalite("accesApi"));

router.get("/",             listKeys);
router.post("/",            createKey);
router.delete("/:id",       validateObjectId("id"), revokeKey);

export default router;
