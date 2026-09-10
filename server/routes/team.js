import express from "express";
import { listMembers, createMember, updateMember, removeMember } from "../controllers/teamController.js";
import { authenticate as protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { exigeFonctionnalite } from "../services/planAccess.js";

const router = express.Router();

// Le middleware pose `req.planEffectif`, dont dépend le nombre de sièges. Il
// résout aussi le titulaire pour un membre d'équipe — mais la gestion de
// l'équipe elle-même reste réservée au titulaire : un agent ne recrute pas.
const seulementTitulaire = (req, res, next) => {
  if (req.user?.teamOf) {
    return res.status(403).json({ message: "Seul le titulaire du compte peut gérer les accès de l'équipe." });
  }
  next();
};

router.use(protect, seulementTitulaire, exigeFonctionnalite("multiUtilisateurs"));

router.get("/members",        listMembers);
router.post("/members",       createMember);
router.patch("/members/:id",  validateObjectId("id"), updateMember);
router.delete("/members/:id", validateObjectId("id"), removeMember);

export default router;
