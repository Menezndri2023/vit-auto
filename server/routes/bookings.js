import express from "express";
import * as b from "../controllers/bookingController.js";
import { authenticate, authorizeAdmin, optionalAuth } from "../middleware/auth.js";
import { generateReceiptPDF } from "../utils/pdfGenerator.js";
import Booking from "../models/Booking.js";

const router = express.Router();

// ── Public : dates bloquées d'un véhicule ─────────────────
router.get("/vehicle/:vehicleId/occupied-dates", b.getVehicleOccupiedDates);

// ── Création réservation (auth optionnelle — liaison user si connecté) ─
router.post("/", optionalAuth, b.createBooking);

// ── Client connecté ───────────────────────────────────────
router.get("/mine",                    authenticate, b.getMyBookings);
router.patch("/:id/validate",          authenticate, b.validateTransaction);
router.patch("/:id/cancel",            authenticate, b.cancelBookingByClient);

// ── Partenaire connecté ───────────────────────────────────
router.get("/partner",                    authenticate, b.getPartnerBookings);
router.get("/partner/stats",              authenticate, b.getPartnerStats);
router.patch("/:id/status",              authenticate, b.updateBookingStatus);
router.patch("/:id/transaction",         authenticate, b.recordTransaction);
router.patch("/:id/partner-confirm",     authenticate, b.partnerConfirm);
router.patch("/:id/partner-kyc-verify",  authenticate, b.partnerVerifyKyc);

// ── Détail commande ───────────────────────────────────────
router.get("/:id/detail",             authenticate, b.getBookingDetail);

// ── Admin ─────────────────────────────────────────────────
router.get("/",                           authenticate, authorizeAdmin, b.getAllBookings);
router.get("/admin/export",               authenticate, authorizeAdmin, b.exportBookings);
router.get("/admin/stats-full",           authenticate, authorizeAdmin, b.getAdminBookingStats);
router.patch("/:id/admin-status",         authenticate, authorizeAdmin, b.updateBookingStatus);
router.patch("/:id/admin-force-complete", authenticate, authorizeAdmin, b.adminForceComplete);
router.patch("/:id/resolve-dispute",      authenticate, authorizeAdmin, b.resolveDispute);
router.delete("/:id/admin-delete",        authenticate, authorizeAdmin, b.adminDeleteBooking);

// ── PDF reçu de réservation ───────────────────────────────
router.get("/:id/receipt",             authenticate, async (req, res) => {
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
