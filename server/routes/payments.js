import express from "express";
import { rateLimit } from "express-rate-limit";
import * as paymentController from "../controllers/paymentController.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

// La simulation complète réellement un paiement (voir simulatePayment) — sans
// limite dédiée, le apiLimiter générique (300/10min) laissait un IP tenter un
// grand nombre de complétions frauduleuses avant blocage.
const simulateLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  max:             15,
  message:         { message: "Trop de tentatives. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders:   false,
});

router.post("/",                          optionalAuth, paymentController.createPayment);
router.get("/booking/:bookingId",         validateObjectId("bookingId"), authenticate, paymentController.getBookingPayment);

// ── Passerelle de paiement réelle (Stripe/Orange Money/Wave, avec repli
// simulé si aucun identifiant n'est configuré — voir services/payment/) ────
router.post("/initiate",                  optionalAuth, paymentController.initiatePayment);
router.get("/:id/status",                 vid, optionalAuth, paymentController.getPaymentStatus);
router.post("/:id/simulate",              vid, optionalAuth, simulateLimiter, paymentController.simulatePayment);

// Orange Money ne nécessite pas le corps brut (pas de vérification HMAC) —
// passe par le parsing JSON normal. Stripe et Wave, eux, ont besoin du corps
// BRUT pour vérifier leur signature : leurs routes webhook sont montées
// directement dans server.js, AVANT express.json(), pas ici.
router.post("/webhook/orange-money",      paymentController.orangeMoneyWebhook);

export default router;
