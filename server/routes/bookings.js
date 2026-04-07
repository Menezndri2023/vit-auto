import express from "express";
import * as b from "../controllers/bookingController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// ── Client (optionnel) ────────────────────────────────────
router.post("/", b.createBooking);                                             // créer commande (connecté ou non)

// ── Client connecté ───────────────────────────────────────
router.get("/mine", authenticate, b.getMyBookings);                            // mes commandes

// ── Partenaire connecté ───────────────────────────────────
router.get("/partner", authenticate, b.getPartnerBookings);                    // commandes reçues
router.patch("/:id/status", authenticate, b.updateBookingStatus);              // confirmer/annuler

// ── Admin ─────────────────────────────────────────────────
router.get("/", authenticate, authorizeAdmin, b.getAllBookings);                // toutes les commandes

export default router;
