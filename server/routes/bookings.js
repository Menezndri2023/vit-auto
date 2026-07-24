import express from "express";
import { rateLimit } from "express-rate-limit";
import * as b from "../controllers/bookingController.js";
import { authenticate, authorizeAdmin, optionalAuth, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { generateReceiptPDF } from "../utils/pdfGenerator.js";
import Booking from "../models/Booking.js";

const router = express.Router();
const vid = validateObjectId();

// Créer une réservation déclenche des écritures DB + emails/notifications par
// appel — le apiLimiter générique (300/10min) restait trop permissif pour un
// point d'entrée aussi coûteux, accessible sans authentification.
const createBookingLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  max:             30,
  message:         { message: "Trop de réservations créées. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Public : dates/créneaux déjà occupés ──────────────────
router.get("/vehicle/:vehicleId/occupied-dates", b.getVehicleOccupiedDates);
router.get("/driver/:driverId/occupied-slots",   b.getDriverOccupiedSlots);
router.get("/vehicle/:vehicleId/essai-slots",    b.getEssaiOccupiedSlots);

// ── Création réservation (auth optionnelle — liaison user si connecté) ─
router.post("/", createBookingLimiter, optionalAuth, b.createBooking);

// ── Client connecté ───────────────────────────────────────
router.get("/mine",                    authenticate, b.getMyBookings);
router.patch("/:id/validate",          vid, authenticate, b.validateTransaction);
router.patch("/:id/cancel",            vid, authenticate, b.cancelBookingByClient);
router.patch("/:id/modify",            vid, authenticate, b.modifyBookingDates);
router.patch("/:id/driver-arrived",    vid, authenticate, b.markDriverArrived);   // client confirme l'arrivée du chauffeur
router.patch("/:id/complete-mission",  vid, authenticate, b.completeMission);      // client clôt la mission chauffeur

// ── Partenaire connecté ───────────────────────────────────
router.get("/partner",                    authenticate, b.getPartnerBookings);
router.get("/partner/stats",              authenticate, b.getPartnerStats);
router.get("/partner/analytics",          authenticate, b.getPartnerAnalytics);
router.get("/partner/export",             authenticate, b.exportPartnerBookings);
router.patch("/:id/status",              vid, authenticate, b.updateBookingStatus);
router.patch("/:id/transaction",         vid, authenticate, b.recordTransaction);
router.patch("/:id/partner-confirm",     vid, authenticate, b.partnerConfirm);
router.patch("/:id/partner-kyc-verify",  vid, authenticate, b.partnerVerifyKyc);
router.patch("/:id/caution",             vid, authenticate, b.claimCaution);

// ── Détail commande ───────────────────────────────────────
router.get("/:id/detail",             vid, authenticate, b.getBookingDetail);

// ── Admin ─────────────────────────────────────────────────
router.get("/",                           authenticate, authorizeAdmin, b.getAllBookings);
router.get("/admin/export",               authenticate, authorizeAdmin, b.exportBookings);
router.get("/admin/stats-full",           authenticate, authorizeAdmin, b.getAdminBookingStats);
router.get("/admin/financing",            authenticate, authorizeAdmin, requireAdminScope("finance"), b.getFinancingRequests);
router.patch("/:id/financing-decision",   vid, authenticate, authorizeAdmin, requireAdminScope("finance"), b.setFinancingDecision);
router.patch("/:id/admin-status",         vid, authenticate, authorizeAdmin, b.updateBookingStatus);
router.patch("/:id/admin-force-complete", vid, authenticate, authorizeAdmin, b.adminForceComplete);
router.patch("/:id/resolve-dispute",      vid, authenticate, authorizeAdmin, b.resolveDispute);
router.delete("/:id/admin-delete",        vid, authenticate, authorizeAdmin, b.adminDeleteBooking);

// ── PDF reçu de réservation ───────────────────────────────
router.get("/:id/receipt",             vid, authenticate, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("vehicle", "title marque modele")
      .populate("client",  "firstName lastName email");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
    const uid      = req.user._id.toString();
    const clientId = booking.client?._id?.toString() || booking.client?.toString();
    const isClient = clientId && clientId === uid;
    const vOwner   = booking.vehicle?.owner?.toString();
    if (!isClient && vOwner !== uid && req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé." });
    }
    generateReceiptPDF(booking, res);
  } catch { res.status(500).json({ message: "Erreur génération PDF." }); }
});

export default router;
