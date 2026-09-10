import express from "express";
import {
  apiListVehicles, apiGetVehicle, apiSetAvailability, apiListBookings, apiWhoAmI,
} from "../controllers/publicApiController.js";
import { authenticateApiKey, exigePortee } from "../middleware/apiKeyAuth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// Toute la surface v1 exige une clé. Aucune route publique n'y est montée : un
// « juste pour tester » sans authentification finit toujours par rester.
router.use(authenticateApiKey);

router.get("/me", apiWhoAmI);

router.get("/vehicles",     exigePortee("vehicles:read"),  apiListVehicles);
router.get("/vehicles/:id", exigePortee("vehicles:read"),  validateObjectId("id"), apiGetVehicle);
router.patch("/vehicles/:id/availability", exigePortee("vehicles:write"), validateObjectId("id"), apiSetAvailability);

router.get("/bookings",     exigePortee("bookings:read"),  apiListBookings);

export default router;
