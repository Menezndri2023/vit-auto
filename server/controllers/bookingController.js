import logger from "../utils/logger.js";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import Contract from "../models/Contract.js";
import User from "../models/User.js";
import { dispatch, schedule } from "../queue/index.js";
import { QUEUE_NAMES } from "../queue/definitions.js";
import { resolveDeliveryFee, detectCountryFromCoords } from "../services/deliveryFee.js";
import { applyPromotion } from "../utils/promotion.js";
import { resolveCommissionRate, computeServiceFee, getRentalOptionPrice } from "../services/pricingEngine.js";
import { convertAmount } from "../services/currencyEngine.js";
import { issueServiceInvoice } from "./serviceInvoiceController.js";
import { recordPartnerPayout } from "../utils/commissionLedger.js";
import {
  CLIENT_CANCEL_REASONS, PARTNER_CANCEL_REASONS,
  CLIENT_CANCEL_REASON_CODES, PARTNER_CANCEL_REASON_CODES,
} from "../constants/bookingCancelReasons.js";

const CLIENT_CANCEL_REASONS_MAP  = Object.fromEntries(CLIENT_CANCEL_REASONS);
const PARTNER_CANCEL_REASONS_MAP = Object.fromEntries(PARTNER_CANCEL_REASONS);

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Émettre un événement Socket.io sur tous les participants d'une commande ──
function emitBookingUpdate(booking, eventName = "booking_updated", extra = {}) {
  const io = global._io;
  if (!io) return;
  const payload = {
    bookingId:  booking._id?.toString() || booking.id,
    reference:  booking.reference,
    status:     booking.status,
    updatedAt:  new Date().toISOString(),
    ...extra,
  };
  // → Client
  if (booking.client) {
    io.to(`user_${booking.client}`).emit(eventName, payload);
  }
  // → Partenaire (propriétaire véhicule ou chauffeur)
  const vOwner = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
  const dOwner = booking.driver?.owner?._id?.toString()  || booking.driver?.owner?.toString();
  if (vOwner) io.to(`partner_${vOwner}`).emit(eventName, payload);
  if (dOwner && dOwner !== vOwner) io.to(`partner_${dOwner}`).emit(eventName, payload);
  // → Admins
  io.to("admins").emit(eventName, payload);
}

// ── Mettre à jour la disponibilité d'un véhicule après un changement de statut
// Exportée pour vehicleController.js : un partenaire n'avait jusqu'ici AUCUN
// moyen de retirer manuellement un véhicule de la disponibilité (ex. en
// maintenance) — `available` était intégralement recalculé depuis les
// réservations actives, sans possibilité de forcer une pause. Manque réel
// trouvé en audit — voir Vehicle.manuallyPaused.
export async function syncVehicleAvailability(vehicleId) {
  if (!vehicleId) return;
  try {
    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation",
    ];
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const [hasActiveBooking, vehicle] = await Promise.all([
      Booking.exists({
        vehicle: vehicleId,
        status:  { $in: activeStatuses },
        "location.startDate": { $lt: tomorrow },
        "location.endDate":   { $gt: today },
      }),
      Vehicle.findById(vehicleId).select("manuallyPaused status"),
    ]);
    // Un véhicule vendu (voir markVehicleSoldIfApplicable) ne doit plus jamais
    // redevenir "disponible" via cette synchro, qui ne raisonne qu'en termes
    // de réservations location actives.
    if (vehicle?.status === "sold") return;

    await Vehicle.findByIdAndUpdate(vehicleId, { available: !vehicle?.manuallyPaused && !hasActiveBooking });
  } catch { /* non-bloquant */ }
}

// ── Retire un véhicule vendu de la disponibilité — bug réel trouvé en audit :
// une vente (booking type "essai" sur un Vehicle.type "vente", conclue via
// recordTransaction/validateTransaction) ne délistait jamais le véhicule.
// syncVehicleAvailability ne se base QUE sur les réservations "location" en
// cours ; sans ce check, un véhicule vendu redevenait "disponible" au prochain
// appel de syncVehicleAvailability puisqu'aucune réservation location ne le
// couvre. Appelé sur chaque chemin qui peut amener un booking "essai" à
// "completed" (validateTransaction, adminForceComplete, resolveDispute,
// updateBookingStatus).
async function markVehicleSoldIfApplicable(booking) {
  if (booking.type !== "essai") return;
  try {
    const vehicleId = booking.vehicle?._id || booking.vehicle;
    if (!vehicleId) return;
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle || vehicle.type !== "vente" || vehicle.status === "sold") return;

    vehicle.status = "sold";
    vehicle.available = false;
    vehicle.statusHistory = vehicle.statusHistory || [];
    vehicle.statusHistory.push({ status: "sold", changedAt: new Date() });
    await vehicle.save();
  } catch { /* non-bloquant */ }
}

// Tarifs options (gps/babySeat/insurance/driver) : voir
// pricingEngine.getRentalOptionPrice() / PricingConfig.rentalOptions (USD).

// ── Durée fixe d'un rendez-vous d'essai (véhicule en vente) ────────────────────
// Sert uniquement à détecter les chevauchements de créneaux sur le même
// véhicule (voir essai.dateFin) — pas une contrainte métier configurable pour
// l'instant, un essai type dure environ une heure.
const ESSAI_DURATION_MS = 60 * 60 * 1000;

// ── Taux de commission par type ────────────────────────────────────────────────
// Résolution complète (standard / abonné premium / Founding Partner actif)
// déléguée à pricingEngine.resolveCommissionRate(type, ownerId) — signature
// conservée à l'identique pour ne pas toucher les points d'appel ci-dessous.
// Toutes les valeurs vivent désormais dans PricingConfig (voir
// server/models/PricingConfig.js), éditable admin sans redéploiement.

// ── Génération référence unique ────────────────────────────────────────────────
const REF_PREFIX = { location: "LOC", essai: "VENTE", chauffeur: "CHAUFF", leasing: "LEAS" };

async function generateReference(type) {
  const year   = new Date().getFullYear();
  const prefix = REF_PREFIX[type] || "SVC";
  const pattern = new RegExp(`^VIT-${prefix}-${year}-`);
  const count  = await Booking.countDocuments({ reference: { $regex: pattern } });
  return `VIT-${prefix}-${year}-${String(count + 1).padStart(6, "0")}`;
}

// ── Notifier un utilisateur ────────────────────────────────────────────────────
async function notify(userId, type, titre, message, lien = "/dashboard") {
  if (!userId) return;
  const notif = await Notification.create({ user: userId, type, titre, message, lien }).catch(() => null);
  // ── Émettre en temps réel via Socket.io ─────────────────────────────────
  if (notif && global._io) {
    global._io.to(`user_${userId}`).emit("notification_new", {
      _id:     notif._id,
      type,
      titre,
      message,
      lien,
      lu:      false,
      createdAt: notif.createdAt,
    });
  }
  // Push natif (iOS/Android) — réveille l'app quand elle est fermée/en arrière-
  // plan ; le Socket.io ci-dessus ne fonctionne que si l'app est ouverte. Voir
  // dispatch.pushNotification (no-op silencieux si l'utilisateur n'a pas
  // enregistré d'appareil natif ou si FCM_SERVER_KEY n'est pas configuré).
  dispatch.pushNotification(userId, titre, message, { lien, type }).catch(() => {});
}

// ── Notifier tous les admins ────────────────────────────────────────────────
// Bug réel corrigé (audit) : le commentaire de validateTransaction affirmait
// "Notifier partenaire et admin" à l'ouverture d'un litige, mais seul le
// partenaire était réellement notifié — l'admin ne découvrait un litige qu'en
// rechargeant manuellement l'onglet Litiges.
async function notifyAdmins(type, titre, message, lien = "/admin") {
  const admins = await User.find({ role: "admin" }).select("_id").lean();
  await Promise.all(admins.map((a) => notify(a._id, type, titre, message, lien)));
}

// ── Sondage post-service (client) ──────────────────────────────────────────────
// Une commande peut passer à "completed" depuis 4 endroits distincts
// (updateBookingStatus, validateTransaction, resolveDispute, adminForceComplete) —
// jusqu'ici seul le premier invitait le client à laisser un avis, et aucun des 4
// ne relançait le client s'il ne le faisait pas dans la foulée. Planifie un
// rappel différé (même schéma que dispatch.ieStepTransition côté Import/Export,
// voir import.worker.js "evaluation_prompt") — le worker revérifie qu'aucun avis
// n'a été laissé entre-temps avant d'envoyer la relance (voir notification.worker.js).
function schedulePostServiceSurvey(booking) {
  if (!booking?.client) return;
  schedule(QUEUE_NAMES.NOTIFICATION, "booking_review_reminder", {
    channel:   "booking_review_reminder",
    bookingId: booking._id.toString(),
    userId:    booking.client.toString(),
    type:      "system",
    titre:     "⭐ Comment s'est passée votre expérience ?",
    message:   `Donnez votre avis sur votre commande ${booking.reference || ""} — ça aide les autres clients à choisir en confiance.`,
    lien:      "/dashboard",
  }, 24 * 3600 * 1000).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CRÉER UNE COMMANDE
// ═══════════════════════════════════════════════════════════════════════════════
export const createBooking = async (req, res) => {
  try {
    const { type, clientInfo, vehicleId, driverId, location, essai, chauffeur, leasing: leasingData, payment: paymentData } = req.body;

    if (!type || !clientInfo?.firstName || !clientInfo?.email) {
      return res.status(400).json({ message: "Type et informations client requis." });
    }
    if (!clientInfo?.passportNumber || !String(clientInfo.passportNumber).trim()) {
      return res.status(400).json({ message: "Numéro de passeport requis." });
    }

    // ── Validation des quantités (évite montants négatifs/NaN en aval) ─────────
    if (type === "location" && location?.days !== undefined) {
      const days = Number(location.days);
      if (!Number.isFinite(days) || days <= 0) {
        return res.status(400).json({ message: "Nombre de jours de location invalide." });
      }
    }
    if (type === "chauffeur" && chauffeur?.heures !== undefined) {
      const heures = Number(chauffeur.heures);
      if (!Number.isFinite(heures) || heures <= 0) {
        return res.status(400).json({ message: "Nombre d'heures invalide." });
      }
    }
    if (type === "leasing" && leasingData?.apportInitial !== undefined) {
      const apport = Number(leasingData.apportInitial);
      if (!Number.isFinite(apport) || apport < 0) {
        return res.status(400).json({ message: "Apport initial invalide." });
      }
      // "leasing" (LOA) et "credit" (crédit classique) partagent le même type
      // de réservation — voir Booking.leasing.financingType.
      if (leasingData.financingType && !["leasing", "credit"].includes(leasingData.financingType)) {
        return res.status(400).json({ message: "Type de financement invalide." });
      }
    }

    let montantBase = 0;
    let cautionAmount = 0;
    let vehicle = null;
    let driver  = null;
    let ownerId = null;
    let essaiPreferredDate   = null;
    let essaiDateFinComputed = null;

    // ── Véhicule ───────────────────────────────────────────────────────────────
    if (["location", "essai", "leasing"].includes(type)) {
      if (!vehicleId) return res.status(400).json({ message: "vehicleId requis." });
      vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });
      // `available` est recalculé automatiquement (occupation/pause manuelle,
      // voir syncVehicleAvailability/getVehicleAvailability) sans jamais revérifier
      // `status` — un appel public sur GET /api/vehicles/:id/availability peut donc
      // repasser `available:true` un véhicule encore pending/rejected/draft. Seul
      // `status` fait foi de la modération admin, pour location/essai/leasing.
      if (vehicle.status !== "approved") {
        return res.status(409).json({ message: "Véhicule non disponible." });
      }
      if (!vehicle.available && type === "location") {
        return res.status(409).json({ message: "Véhicule non disponible." });
      }
      ownerId = vehicle.owner;

      if (type === "location") {
        const startDate = location?.startDate ? new Date(location.startDate) : null;
        const endDate   = location?.endDate   ? new Date(location.endDate)   : null;
        if (startDate && endDate) {
          if (endDate <= startDate) {
            return res.status(400).json({ message: "La date de fin doit être postérieure à la date de début." });
          }
          const conflict = await Booking.findOne({
            vehicle: vehicleId,
            status:  { $in: ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation"] },
            "location.startDate": { $lt: endDate },
            "location.endDate":   { $gt: startDate },
          });
          if (conflict) {
            return res.status(409).json({
              message: "Ce véhicule est déjà réservé sur ces dates.",
              conflict: { startDate: conflict.location.startDate, endDate: conflict.location.endDate },
            });
          }
        }
        // Prix/jour toujours recalculé côté serveur (jamais confiance dans un
        // prix déjà remisé envoyé par le client) — applique la meilleure règle
        // de promotion éligible pour la durée réservée (voir Vehicle.promotions).
        const effectivePricePerDay = applyPromotion(vehicle.pricePerDay || 0, location?.days || 1, vehicle.promotions);
        montantBase = effectivePricePerDay * (location?.days || 1);
      }
      // Caution toujours dérivée de la configuration réelle du véhicule
      // (vehicle.caution, fixée par le partenaire à la publication), jamais
      // d'une estimation ou d'une valeur envoyée par le client — sinon trois
      // montants de caution différents peuvent coexister (véhicule, client,
      // contrat) sans jamais se recouper.
      if (type === "location") {
        cautionAmount = vehicle.caution || 0;
      }
      if (type === "leasing") {
        // Un client pouvait demander un financement (leasing ou crédit) sur
        // n'importe quel véhicule, même si le partenaire ne l'a jamais activé
        // (Vehicle.leasing.disponible / Vehicle.credit.disponible, tous deux
        // false par défaut) — seul le formulaire côté client vérifiait cela,
        // jamais le serveur. Bug réel trouvé en audit.
        const financingType = ["leasing", "credit"].includes(leasingData?.financingType) ? leasingData.financingType : "leasing";
        const financingTerms = vehicle[financingType];
        if (!financingTerms?.disponible) {
          return res.status(400).json({ message: financingType === "credit" ? "Le crédit classique n'est pas proposé pour ce véhicule." : "Le leasing (LOA) n'est pas proposé pour ce véhicule." });
        }
        montantBase = leasingData?.apportInitial || 0;
      }
      if (type === "essai") {
        // Un véhicule en vente pouvait auparavant recevoir plusieurs demandes
        // d'essai sur le même créneau sans aucune détection — même principe
        // que le planning chauffeur (chauffeur.date/dateFin) : la date de fin
        // est calculée côté serveur (durée fixe d'un essai), jamais fournie
        // par le client.
        // Un essai n'a de sens que sur un véhicule "vente" — jusqu'ici
        // vérifié seulement côté UI, jamais côté serveur (bug réel trouvé en audit).
        if (vehicle.type !== "vente") {
          return res.status(400).json({ message: "Un essai ne peut être demandé que pour un véhicule à vendre." });
        }
        const preferredDate = essai?.preferredDate ? new Date(essai.preferredDate) : null;
        if (!preferredDate || isNaN(preferredDate.getTime())) {
          return res.status(400).json({ message: "Date et heure souhaitées pour l'essai requises." });
        }
        if (essai?.preferredTime) {
          const dateStr = preferredDate.toISOString().split("T")[0];
          const combined = new Date(`${dateStr}T${essai.preferredTime}:00`);
          if (!isNaN(combined.getTime())) preferredDate.setTime(combined.getTime());
        }
        if (preferredDate < new Date()) {
          return res.status(400).json({ message: "La date de l'essai ne peut pas être dans le passé." });
        }
        const essaiDateFin = new Date(preferredDate.getTime() + ESSAI_DURATION_MS);

        const conflict = await Booking.findOne({
          vehicle: vehicleId,
          status:  { $in: ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation"] },
          "essai.preferredDate": { $lt: essaiDateFin },
          "essai.dateFin":       { $gt: preferredDate },
        });
        if (conflict) {
          return res.status(409).json({
            message: "Un essai est déjà prévu sur ce véhicule à ce créneau.",
            conflict: { preferredDate: conflict.essai.preferredDate, dateFin: conflict.essai.dateFin },
          });
        }

        essaiPreferredDate = preferredDate;
        essaiDateFinComputed = essaiDateFin;
      }
    }

    // ── Chauffeur ──────────────────────────────────────────────────────────────
    let chauffeurDateFin   = null;
    let chauffeurDateStart = null;
    if (type === "chauffeur") {
      if (!driverId) return res.status(400).json({ message: "driverId requis." });
      driver = await Driver.findById(driverId);
      if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });
      // `tarif` est le tarif JOURNÉE (voir VendorSubmit.jsx), `tarifHeure` le tarif
      // HORAIRE — utiliser le second pour une facturation à l'heure, sinon on
      // surfacture massivement (ex: tarif journée × nombre d'heures).
      montantBase = (driver.tarifHeure || driver.tarif || 0) * (chauffeur?.heures || 1);
      ownerId = driver.owner;

      // Date/heure de mission requise pour pouvoir détecter les conflits de
      // planning — sans elle, deux clients pouvaient réserver le même
      // chauffeur en même temps sans qu'aucun contrôle ne l'empêche.
      const chauffeurDate = chauffeur?.date ? new Date(chauffeur.date) : null;
      if (!chauffeurDate || isNaN(chauffeurDate.getTime())) {
        return res.status(400).json({ message: "Date et heure de la mission requises." });
      }
      if (chauffeurDate < new Date()) {
        return res.status(400).json({ message: "La date de la mission ne peut pas être dans le passé." });
      }
      const heures = Number(chauffeur?.heures) || 1;
      chauffeurDateFin   = new Date(chauffeurDate.getTime() + heures * 3600000);
      chauffeurDateStart = chauffeurDate;

      const conflict = await Booking.findOne({
        driver:  driverId,
        status:  { $in: ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation"] },
        "chauffeur.date":    { $lt: chauffeurDateFin },
        "chauffeur.dateFin": { $gt: chauffeurDate },
      });
      if (conflict) {
        return res.status(409).json({
          message: "Ce chauffeur est déjà réservé sur ce créneau.",
          conflict: { date: conflict.chauffeur.date, dateFin: conflict.chauffeur.dateFin },
        });
      }

      // ── Congés bloqués par le partenaire (voir driverController.addDriverBlackout) ─
      // Sans ce contrôle, un client pouvait réserver un chauffeur pendant une
      // période explicitement marquée indisponible — le blocage n'existait
      // jusqu'ici que dans l'affichage calendrier, jamais appliqué à la réservation.
      const onBlackout = (driver.blackoutDates || []).some(
        (b) => new Date(b.start) < chauffeurDateFin && new Date(b.end) > chauffeurDate
      );
      if (onBlackout) {
        return res.status(409).json({ message: "Ce chauffeur est indisponible sur cette période (congé)." });
      }
    }

    // ── Options location ───────────────────────────────────────────────────────
    let montantOptions = 0;
    if (type === "location" && location?.options) {
      for (const [key, active] of Object.entries(location.options)) {
        if (!active) continue;
        const optionPrice = await getRentalOptionPrice(key);
        if (optionPrice) montantOptions += optionPrice * (location.days || 1);
      }
    }

    // ── Frais de livraison — recalculé côté serveur, jamais accepté depuis le client ──
    let deliveryFee = 0;
    if (type === "location" && location?.pickupMethod === "livraison") {
      const cLat = location?.pickupPosition?.lat;
      const cLng = location?.pickupPosition?.lng;
      if (cLat != null && cLng != null && vehicle?.coordonnees?.lat != null && vehicle?.coordonnees?.lng != null) {
        const countryCode = detectCountryFromCoords(cLat, cLng);
        const fee = await resolveDeliveryFee({
          clientLat: cLat, clientLng: cLng,
          vehicleLat: vehicle.coordonnees.lat, vehicleLng: vehicle.coordonnees.lng,
          countryCode,
        });
        // resolveDeliveryFee renvoie un montant dans la devise LOCALE du pays
        // (barème deliveryBaseRate/deliveryRatePerKm de CountryConfig) —
        // conversion en USD indispensable avant de l'additionner à montantTotal,
        // qui est désormais toujours en USD (montantBase/montantOptions).
        if (fee?.fee != null) {
          const feeUSD = await convertAmount(fee.fee, fee.currency, "USD");
          deliveryFee = feeUSD ?? 0;
        }
      }
    }

    const montantTotal    = montantBase + montantOptions + deliveryFee;
    const commissionRate  = await resolveCommissionRate(type, ownerId);
    const commissionAmount = Math.round(montantTotal * commissionRate * 100) / 100;
    const serviceFeeFCFA  = await computeServiceFee(montantTotal);
    const partnerPayout   = Math.max(montantTotal - commissionAmount - serviceFeeFCFA, 0);

    const reference = await generateReference(type);

    // Récupérer le statut KYC réel + snapshot complet du client
    let clientKycStatus  = null;
    let clientKycScore   = 0;
    let clientKycSnapshot = null;
    if (req.user?._id) {
      const clientUser = await User.findById(req.user._id)
        .select("kycStatus kycScore kycOcrData kycFaceMatchScore identity driverLicenseOcr")
        .lean();
      if (clientUser) {
        clientKycStatus = clientUser.kycStatus || null;
        clientKycScore  = clientUser.kycScore  || 0;
        clientKycSnapshot = {
          idType:            clientUser.identity?.type           || clientInfo?.idType   || null,
          idNumber:          clientUser.identity?.number         || clientInfo?.idNumber || null,
          frontImage:        clientUser.identity?.frontImage     || null,
          backImage:         clientUser.identity?.backImage      || null,
          selfie:            clientUser.identity?.selfie         || null,
          licenseFrontImage: clientUser.driverLicenseOcr?.frontImage  || null,
          licenseBackImage:  clientUser.driverLicenseOcr?.backImage   || null,
          licenseNumber:     clientUser.driverLicenseOcr?.licenseNumber || null,
          licenseExpiry:     clientUser.driverLicenseOcr?.expiryDate   || null,
          licenseCategories: clientUser.driverLicenseOcr?.categories   || null,
          ocrData:           clientUser.kycOcrData        || null,
          faceMatchScore:    clientUser.kycFaceMatchScore || null,
          kycStatus:         clientKycStatus,
          kycScore:          clientKycScore,
          snapshotAt:        new Date(),
        };
      }
    }

    const bookingData = {
      type,
      reference,
      clientInfo: {
        ...clientInfo,
        kycStatus:  clientKycStatus,
        kycScore:   clientKycScore,
      },
      client:   req.user?._id || null,
      vehicle:  vehicle?._id  || null,
      driver:   driver?._id   || null,
      // deliveryFee toujours écrasé par la valeur calculée serveur ci-dessus, jamais celle du client
      location: type === "location" && location ? { ...location, deliveryFee } : (type === "location" ? location : undefined),
      // preferredDate/dateFin toujours écrasés par les valeurs calculées serveur
      // ci-dessus (combinaison date+heure normalisée, dateFin de conflit),
      // jamais celles envoyées brutes par le client.
      essai:    type === "essai"    ? { ...essai, preferredDate: essaiPreferredDate, dateFin: essaiDateFinComputed } : undefined,
      // dateFin toujours écrasé par la valeur calculée serveur ci-dessus, jamais celle du client
      chauffeur: type === "chauffeur" ? { ...chauffeur, dateFin: chauffeurDateFin } : undefined,
      leasing:  type === "leasing"  ? leasingData : undefined,
      montantBase,
      montantOptions,
      montantTotal,
      cautionAmount,
      devise: "USD",
      commissionRate,
      commissionAmount,
      serviceFeeFCFA,
      partnerPayout,
      clientVerification: {
        idType:     clientInfo?.idType || null,
        idNumber:   clientInfo?.idNumber || null,
        isVerified: clientKycStatus === "VERIFIE",
        verifiedAt: clientKycStatus === "VERIFIE" ? new Date() : null,
      },
      clientKycSnapshot: clientKycSnapshot || undefined,
    };

    // ── Création (atomique si location avec dates, pour empêcher un double
    // booking en cas de deux requêtes concurrentes sur le même véhicule/dates —
    // le contrôle plus haut est un simple "fail fast", pas une garantie) ───────
    let booking;
    const activeStatuses = ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation"];
    if (type === "location" && vehicle && location?.startDate && location?.endDate) {
      const startDate = new Date(location.startDate);
      const endDate   = new Date(location.endDate);
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const conflict = await Booking.findOne({
            vehicle: vehicleId,
            status:  { $in: activeStatuses },
            "location.startDate": { $lt: endDate },
            "location.endDate":   { $gt: startDate },
          }).session(session);
          if (conflict) {
            throw Object.assign(new Error("VEHICLE_CONFLICT"), { conflict });
          }
          const [created] = await Booking.create([bookingData], { session });
          booking = created;
        });
      } catch (txErr) {
        if (txErr.conflict) {
          return res.status(409).json({
            message: "Ce véhicule est déjà réservé sur ces dates.",
            conflict: { startDate: txErr.conflict.location.startDate, endDate: txErr.conflict.location.endDate },
          });
        }
        throw txErr;
      } finally {
        await session.endSession();
      }
    } else if (type === "essai" && vehicle && essaiPreferredDate && essaiDateFinComputed) {
      // Même garantie que "location" ci-dessus — la pré-vérification plus haut
      // (lignes ~296-307) n'était qu'un fail-fast, jamais une garantie contre
      // deux essais concurrents créés au même instant (bug réel trouvé en audit).
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const conflict = await Booking.findOne({
            vehicle: vehicleId,
            status:  { $in: activeStatuses },
            "essai.preferredDate": { $lt: essaiDateFinComputed },
            "essai.dateFin":       { $gt: essaiPreferredDate },
          }).session(session);
          if (conflict) {
            throw Object.assign(new Error("ESSAI_CONFLICT"), { conflict });
          }
          const [created] = await Booking.create([bookingData], { session });
          booking = created;
        });
      } catch (txErr) {
        if (txErr.conflict) {
          return res.status(409).json({
            message: "Un essai est déjà prévu sur ce véhicule à ce créneau.",
            conflict: { preferredDate: txErr.conflict.essai.preferredDate, dateFin: txErr.conflict.essai.dateFin },
          });
        }
        throw txErr;
      } finally {
        await session.endSession();
      }
    } else if (type === "chauffeur" && driver && chauffeurDateStart && chauffeurDateFin) {
      // Idem — la pré-vérification plus haut (lignes ~339-350) n'empêchait pas
      // deux missions concurrentes créées au même instant sur le même chauffeur.
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const conflict = await Booking.findOne({
            driver:  driverId,
            status:  { $in: activeStatuses },
            "chauffeur.date":    { $lt: chauffeurDateFin },
            "chauffeur.dateFin": { $gt: chauffeurDateStart },
          }).session(session);
          if (conflict) {
            throw Object.assign(new Error("DRIVER_CONFLICT"), { conflict });
          }
          const [created] = await Booking.create([bookingData], { session });
          booking = created;
        });
      } catch (txErr) {
        if (txErr.conflict) {
          return res.status(409).json({
            message: "Ce chauffeur est déjà réservé sur ce créneau.",
            conflict: { date: txErr.conflict.chauffeur.date, dateFin: txErr.conflict.chauffeur.dateFin },
          });
        }
        throw txErr;
      } finally {
        await session.endSession();
      }
    } else {
      booking = await Booking.create(bookingData);
    }

    // ── Paiement en ligne optionnel ────────────────────────────────────────────
    // Aucun prestataire de paiement réel n'est branché (pas de vérification de
    // webhook signé) : on enregistre la demande en "pending" au lieu de confirmer
    // automatiquement — même traitement que paymentController.createPayment.
    const VALID_PAY_METHODS = ["card", "orange_money", "wave", "mtn", "moov", "paypal", "applepay", "virement", "test"];
    const payMethod = paymentData?.method;
    if (payMethod && payMethod !== "cash" && VALID_PAY_METHODS.includes(payMethod)) {
      try {
        const paiement = await Payment.create({
          booking: booking._id,
          amount:  montantTotal,
          method:  payMethod,
          status:  "pending",
          paymentDetails: {
            // Le client ne transmet que les 4 derniers chiffres (troncature faite
            // dans le navigateur) — voir Booking.jsx.
            cardLast4:    paymentData.cardLast4?.slice(-4) || null,
            cardHolder:   paymentData.cardHolder || null,
            mobileNumber: paymentData.mobileNumber
              ? paymentData.mobileNumber.replace(/\d(?=\d{2})/g, "*") // masquer sauf 2 derniers chiffres
              : null,
            provider:     payMethod,
          },
        });
        booking.payment = paiement._id;
        await booking.save();
      } catch (payErr) {
        logger.error("createBooking — payment creation failed (non-bloquant):", payErr.message);
        // Le booking reste en "pending" — le partenaire devra confirmer manuellement
      }
    }

    // ── Notifications + Email + SMS → Queue BullMQ (non-bloquant) ───────────────
    // Bug réel corrigé (audit) : pour type "chauffeur", `vehicle` reste null
    // (seul `driver` est peuplé) — la notification interne partenaire mise en
    // queue BullMQ (queue/index.js bookingCreated, branche vehicle?.owner._id)
    // et le nom affiché dans l'email de confirmation client (vehicleTitle)
    // sautaient silencieusement. Le seul filet de sécurité restant était
    // l'appel direct notify() ci-dessous, dont les erreurs sont avalées
    // (.catch(() => {})) sans retry BullMQ, contrairement aux autres types de
    // booking. On construit un objet "vehicle"-compatible à partir du
    // chauffeur pour réutiliser exactement le même chemin que les autres types.
    const vehicleOrDriverForDispatch = vehicle
      ? { _id: vehicle._id, title: vehicle.title, owner: { _id: ownerId } }
      : driver
        ? { _id: driver._id, title: driver.title || `${driver.firstName} ${driver.lastName}`, owner: { _id: ownerId } }
        : null;
    dispatch.bookingCreated(
      { _id: booking._id, reference, type, montantTotal, location, status: booking.status },
      req.user ? { _id: req.user._id, email: req.user.email, phone: req.user.phone, firstName: req.user.firstName } : null,
      vehicleOrDriverForDispatch
    ).catch((e) => logger.error("dispatch.bookingCreated:", { error: e.message }));

    // Notification temps réel Socket.io immédiate (partenaire propriétaire)
    if (ownerId) {
      notify(ownerId, "new_booking", "📋 Nouvelle commande reçue",
        `${clientInfo.firstName} ${clientInfo.lastName} — Réservation ${reference}`, "/vendor/dashboard"
      ).catch(() => {});
    }

    // 1ère réservation de ce client (tous types confondus) — signalée
    // directement dans la réponse plutôt que via une notification/socket :
    // l'utilisateur est déjà sur l'écran de confirmation au moment exact où
    // ça se produit, pas besoin d'un aller-retour supplémentaire pour
    // déclencher l'animation de félicitations côté front (voir BookingSuccess.jsx).
    let isFirstBooking = false;
    if (req.user?._id) {
      const priorCount = await Booking.countDocuments({ client: req.user._id, _id: { $ne: booking._id } });
      isFirstBooking = priorCount === 0;
    }

    res.status(201).json({ booking, isFirstBooking });
  } catch (err) {
    logger.error("createBooking:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1b. RÉSERVATION MULTIPLE (PANIER) — POST /bookings/batch
// ═══════════════════════════════════════════════════════════════════════════════
// Permet de réserver plusieurs véhicules en une seule action (retrait uniquement,
// sans options ni financement — un client qui a besoin de ces réglages fins
// repasse par le parcours détaillé /booking/:id véhicule par véhicule).
// Traitement "au mieux" : chaque véhicule est indépendant, un conflit sur l'un
// ne doit jamais annuler les autres. Authentification requise (pas de panier
// invité) : simplifie clientInfo et évite la confusion "j'ai un compte mais
// j'ai réservé en invité par erreur" sur un panier à plusieurs véhicules.
const MAX_BATCH_ITEMS = 8;

export const createBookingsBatch = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ message: "Le panier est vide." });
    }
    if (items.length > MAX_BATCH_ITEMS) {
      return res.status(400).json({ message: `Maximum ${MAX_BATCH_ITEMS} véhicules par panier.` });
    }
    const passportNumber = req.body?.passportNumber;
    if (!passportNumber || !String(passportNumber).trim()) {
      return res.status(400).json({ message: "Numéro de passeport requis." });
    }

    const clientInfo = {
      firstName: req.user.firstName,
      lastName:  req.user.lastName,
      email:     req.user.email,
      phone:     req.user.phone || null,
      passportNumber,
    };

    // Snapshot KYC récupéré une seule fois (identique pour tous les véhicules
    // du panier), même logique que createBooking ci-dessus.
    const clientUser = await User.findById(req.user._id)
      .select("kycStatus kycScore kycOcrData kycFaceMatchScore identity driverLicenseOcr")
      .lean();
    const clientKycStatus = clientUser?.kycStatus || null;
    const clientKycScore  = clientUser?.kycScore  || 0;
    const clientKycSnapshot = clientUser ? {
      idType:            clientUser.identity?.type           || null,
      idNumber:          clientUser.identity?.number         || null,
      frontImage:        clientUser.identity?.frontImage     || null,
      backImage:         clientUser.identity?.backImage      || null,
      selfie:            clientUser.identity?.selfie         || null,
      licenseFrontImage: clientUser.driverLicenseOcr?.frontImage  || null,
      licenseBackImage:  clientUser.driverLicenseOcr?.backImage   || null,
      licenseNumber:     clientUser.driverLicenseOcr?.licenseNumber || null,
      licenseExpiry:     clientUser.driverLicenseOcr?.expiryDate   || null,
      licenseCategories: clientUser.driverLicenseOcr?.categories   || null,
      ocrData:           clientUser.kycOcrData        || null,
      faceMatchScore:    clientUser.kycFaceMatchScore || null,
      kycStatus:         clientKycStatus,
      kycScore:          clientKycScore,
      snapshotAt:        new Date(),
    } : undefined;

    const activeStatuses = ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation"];
    const results = [];

    for (const item of items) {
      const { vehicleId, startDate: startRaw, endDate: endRaw } = item || {};
      try {
        if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
          results.push({ vehicleId, ok: false, message: "Véhicule invalide." });
          continue;
        }
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) {
          results.push({ vehicleId, ok: false, message: "Véhicule introuvable." });
          continue;
        }
        if (vehicle.type !== "location") {
          results.push({ vehicleId, ok: false, message: "Ce véhicule n'est pas disponible à la location." });
          continue;
        }
        if (vehicle.status !== "approved") {
          results.push({ vehicleId, ok: false, message: "Véhicule non disponible.", title: vehicle.title });
          continue;
        }
        if (!vehicle.available) {
          results.push({ vehicleId, ok: false, message: "Véhicule non disponible.", title: vehicle.title });
          continue;
        }

        const startDate = new Date(startRaw);
        const endDate   = new Date(endRaw);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
          results.push({ vehicleId, ok: false, message: "Dates invalides.", title: vehicle.title });
          continue;
        }
        if (startDate < new Date()) {
          results.push({ vehicleId, ok: false, message: "La date de début ne peut pas être dans le passé.", title: vehicle.title });
          continue;
        }

        const days = Math.max(1, Math.round((endDate - startDate) / 86400000));
        const effectivePricePerDay = applyPromotion(vehicle.pricePerDay || 0, days, vehicle.promotions);
        const montantBase  = effectivePricePerDay * days;
        const montantTotal = montantBase;
        const commissionRate   = await resolveCommissionRate("location", vehicle.owner);
        const commissionAmount = Math.round(montantTotal * commissionRate * 100) / 100;
        const serviceFeeFCFA   = await computeServiceFee(montantTotal);
        const partnerPayout    = Math.max(montantTotal - commissionAmount - serviceFeeFCFA, 0);
        const reference = await generateReference("location");

        const bookingData = {
          type: "location",
          reference,
          clientInfo: { ...clientInfo, kycStatus: clientKycStatus, kycScore: clientKycScore },
          client:  req.user._id,
          vehicle: vehicle._id,
          location: { startDate, endDate, days, pickupMethod: "retrait", deliveryFee: 0 },
          montantBase, montantOptions: 0, montantTotal,
          cautionAmount: vehicle.caution || 0,
          devise: "USD",
          commissionRate, commissionAmount, serviceFeeFCFA, partnerPayout,
          clientVerification: {
            idType: clientKycSnapshot?.idType || null,
            idNumber: clientKycSnapshot?.idNumber || null,
            isVerified: clientKycStatus === "VERIFIE",
            verifiedAt: clientKycStatus === "VERIFIE" ? new Date() : null,
          },
          clientKycSnapshot,
        };

        // Même garantie transactionnelle que createBooking (fenêtre de course
        // entre la pré-vérification et l'écriture) — un véhicule du panier ne
        // doit jamais être double-réservé.
        let booking;
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const conflict = await Booking.findOne({
              vehicle: vehicle._id,
              status:  { $in: activeStatuses },
              "location.startDate": { $lt: endDate },
              "location.endDate":   { $gt: startDate },
            }).session(session);
            if (conflict) throw Object.assign(new Error("VEHICLE_CONFLICT"), { conflict });
            const [created] = await Booking.create([bookingData], { session });
            booking = created;
          });
        } catch (txErr) {
          if (txErr.conflict) {
            results.push({ vehicleId, ok: false, message: "Ce véhicule est déjà réservé sur ces dates.", title: vehicle.title });
            continue;
          }
          throw txErr;
        } finally {
          await session.endSession();
        }

        syncVehicleAvailability(vehicle._id).catch(() => {});
        if (vehicle.owner) {
          notify(vehicle.owner, "new_booking", "📋 Nouvelle commande reçue",
            `${clientInfo.firstName} ${clientInfo.lastName} — Réservation ${reference}`, "/vendor/dashboard"
          ).catch(() => {});
        }
        dispatch.bookingCreated(
          { _id: booking._id, reference, type: "location", montantTotal, location: bookingData.location, status: booking.status },
          { _id: req.user._id, email: req.user.email, phone: req.user.phone, firstName: req.user.firstName },
          { _id: vehicle._id, title: vehicle.title, owner: { _id: vehicle.owner } }
        ).catch((e) => logger.error("dispatch.bookingCreated (batch):", { error: e.message }));

        results.push({ vehicleId, ok: true, booking, title: vehicle.title });
      } catch (itemErr) {
        logger.error("createBookingsBatch (item):", itemErr);
        results.push({ vehicleId, ok: false, message: "Erreur lors de la réservation de ce véhicule." });
      }
    }

    const createdCount = results.filter((r) => r.ok).length;
    res.status(201).json({ results, createdCount, failedCount: results.length - createdCount });
  } catch (err) {
    logger.error("createBookingsBatch:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MES COMMANDES (CLIENT)
// ═══════════════════════════════════════════════════════════════════════════════
export const getMyBookings = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
    const safePage  = Math.max(Number(page) || 1, 1);

    const filter = {
      $or: [
        { client: req.user._id },
        { client: null, "clientInfo.email": req.user.email },
      ],
    };

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .populate("vehicle", "title marque modele pricePerDay ville contactTel contactNom owner")
        .populate("driver",  "firstName lastName profilePhoto tarif zone phone owner")
        .populate("payment", "method status amount devise")
        .lean(),
      Booking.countDocuments(filter),
    ]);

    res.json({ bookings, total, pages: Math.ceil(total / safeLimit), page: safePage });
  } catch (err) {
    logger.error("getMyBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. COMMANDES REÇUES (PARTENAIRE)
// ═══════════════════════════════════════════════════════════════════════════════
export const getPartnerBookings = async (req, res) => {
  try {
    const { page = 1, limit = 30, businessId } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
    const safePage  = Math.max(Number(page) || 1, 1);

    // Segmentation par entité (PartnerBusiness) — un partenaire à plusieurs
    // entités filtre ses commandes par entité via la même jointure
    // Vehicle.business/Driver.business que dans pmsController.getPartnerBookings
    // (Booking lui-même ne porte pas cette info, une commande n'appartenant
    // qu'à un seul véhicule/chauffeur qui, lui, appartient à une entité).
    const vehicleFilter = { owner: req.user._id };
    const driverFilter  = { owner: req.user._id };
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      vehicleFilter.business = businessId;
      driverFilter.business  = businessId;
    }
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find(vehicleFilter).select("_id"),
      Driver.find(driverFilter).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);
    const filter = { $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }] };

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .populate("vehicle", "title marque modele owner pricePerDay contactNom contactTel")
        .populate("driver",  "firstName lastName owner tarif phone")
        .populate("payment", "method status amount")
        // Données KYC limitées : le partenaire voit le statut et le score, pas les données biométriques brutes
        .populate("client",  "firstName lastName email phone kycStatus kycScore kycBadge emailVerified phoneVerified")
        .populate("contract", "reference status createdAt")
        .lean(),
      Booking.countDocuments(filter),
    ]);

    res.json({ bookings, total, pages: Math.ceil(total / safeLimit), page: safePage });
  } catch (err) {
    logger.error("getPartnerBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. TOUTES LES COMMANDES (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════
export const getAllBookings = async (req, res) => {
  try {
    const {
      status, type, search,
      dateFrom, dateTo,
      page = 1, limit = 30,
      sortBy = "createdAt", sortDir = "desc",
    } = req.query;

    // Plafond relevé (bug réel trouvé en audit) : même angle mort que
    // getUsers — voir loadMoreBookings (AdminPanel.jsx).
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 1000);
    const ALLOWED_SORT = ["createdAt", "updatedAt", "montantTotal", "status", "reference"];
    const safeSortBy  = ALLOWED_SORT.includes(sortBy) ? sortBy : "createdAt";
    const safeSortDir = sortDir === "asc" ? 1 : -1;

    const filter = {};
    if (status)  filter.status = status.includes(",") ? { $in: status.split(",") } : status;
    if (type)    filter.type   = type;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      const s = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { reference: { $regex: s, $options: "i" } },
        { "clientInfo.firstName": { $regex: s, $options: "i" } },
        { "clientInfo.lastName":  { $regex: s, $options: "i" } },
        { "clientInfo.email":     { $regex: s, $options: "i" } },
        { "clientInfo.phone":     { $regex: s, $options: "i" } },
      ];
    }

    const sort = { [safeSortBy]: safeSortDir };
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort(sort)
        .skip((Math.max(Number(page), 1) - 1) * safeLimit)
        .limit(safeLimit)
        .populate("client",  "firstName lastName email phone kycStatus kycScore")
        .populate("vehicle", "title marque modele owner ville")
        .populate("driver",  "firstName lastName owner")
        .lean(),
      Booking.countDocuments(filter),
    ]);

    // Compteurs par statut pour affichage rapide — respecte le filtre de dates s'il est
    // posé (évite un $group sans $match, qui scanne toute la collection à chaque appel),
    // mais ignore volontairement le filtre "status" pour garder tous les compteurs visibles.
    const countsFilter = {};
    if (filter.createdAt) countsFilter.createdAt = filter.createdAt;
    const counts = await Booking.aggregate([
      ...(Object.keys(countsFilter).length ? [{ $match: countsFilter }] : []),
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const byStatus = Object.fromEntries(counts.map(c => [c._id, c.count]));

    res.json({ bookings, total, pages: Math.ceil(total / safeLimit), page: Number(page), byStatus });
  } catch (err) {
    logger.error("getAllBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WORKFLOW PARTENAIRE : ACCEPTER / REFUSER / SUIVI LIVRAISON
// ═══════════════════════════════════════════════════════════════════════════════
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancelReason, cancelReasonCode } = req.body;

    // Motif catégorisé obligatoire pour toute annulation initiée par un
    // partenaire (ou un admin, cette route sert aussi son panel) — le texte
    // libre `cancelReason` reste facultatif. Avant ce correctif, un partenaire
    // pouvait annuler n'importe quelle réservation sans laisser aucune trace
    // exploitable du motif.
    if (status === "cancelled" && !PARTNER_CANCEL_REASON_CODES.includes(cancelReasonCode)) {
      return res.status(400).json({
        message: "Veuillez sélectionner un motif d'annulation.",
        allowedReasonCodes: PARTNER_CANCEL_REASON_CODES,
      });
    }

    const validStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress", "completed", "cancelled",
      "client_arrived", "client_absent",
      "transaction_concluded", "transaction_not_concluded",
      "waiting_client_validation", "disputed",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    // ── Machine à états : transitions autorisées ──────────────────────────────
    // Le parcours "preparing" → "ready" → "in_progress" n'est pas suivi à l'identique
    // par tous les services (VendorDashboard.jsx a un workflow dédié par sous-type) :
    //   - location à l'agence   : ready → client_arrived        (pas d'étape "en route")
    //   - essai / vente         : confirmed → in_progress        (pas de préparation)
    //   - chauffeur             : preparing → in_progress        (pas d'étape "ready")
    //   - leasing               : ready → client_arrived         (signature directe)
    // Chaque étape intermédiaire du pipeline générique est donc acceptée comme
    // saut en avant légitime, tant qu'on ne saute pas les étapes qui déclenchent
    // une action métier dédiée (transaction, validation, résolution de litige).
    const VALID_TRANSITIONS = {
      pending:                    ["confirmed", "cancelled"],
      confirmed:                  ["preparing", "in_progress", "cancelled"],
      preparing:                  ["ready", "in_progress", "cancelled"],
      ready:                      ["in_progress", "client_arrived", "cancelled"],
      in_progress:                ["client_arrived", "client_absent", "cancelled"],
      client_arrived:             ["transaction_concluded", "transaction_not_concluded", "client_absent"],
      client_absent:              ["in_progress", "cancelled"],
      transaction_concluded:      ["waiting_client_validation", "cancelled"],
      transaction_not_concluded:  ["in_progress", "cancelled"],
      waiting_client_validation:  ["completed", "disputed"],
      disputed:                   ["completed", "cancelled"],
      completed:                  [],  // terminal
      cancelled:                  [],  // terminal
    };

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande non trouvée dans la base de données." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "owner title marque modele contactNom contactTel pricePerDay")
      .populate("driver",  "owner firstName lastName");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });

    // Ownership robuste : vérifier que l'ID propriétaire est bien défini avant comparaison
    const vehicleOwnerId = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
    const driverOwnerId  = booking.driver?.owner?._id?.toString()  || booking.driver?.owner?.toString();
    const userId         = req.user._id.toString();

    const isOwner = (vehicleOwnerId && vehicleOwnerId === userId) ||
                    (driverOwnerId  && driverOwnerId  === userId);

    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    // ── Vérifier la validité de la transition d'état ──────────────────────────
    // Bug réel corrigé (audit) : "cancelled" n'était pas une transition
    // autorisée depuis client_arrived/waiting_client_validation — une
    // réservation bloquée dans ces deux états ne pouvait alors JAMAIS être
    // annulée, ni par le partenaire ni par l'admin (aucun bouton de secours
    // dans AdminPanel.jsx). Un admin garde donc un droit d'annulation
    // d'urgence même hors machine à états, réservé à ce rôle (pas au
    // partenaire, pour ne pas contourner le workflow transaction/litige).
    const isAdminEmergencyCancel = req.user.role === "admin" && status === "cancelled";
    const allowed = VALID_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(status) && !isAdminEmergencyCancel) {
      return res.status(409).json({
        message: `Transition invalide : ${booking.status} → ${status}.`,
        allowedTransitions: allowed,
      });
    }

    // ── Financement (leasing/crédit) : aucune progression avant décision admin ──
    // setFinancingDecision existait déjà mais n'était vérifié nulle part —
    // un booking "leasing" pouvait avancer jusqu'à "completed" (apport collecté)
    // avant même que l'admin n'ait approuvé le financement. Bug réel trouvé en audit.
    if (booking.type === "leasing" && status !== "cancelled" && booking.leasing?.decision !== "accepte") {
      return res.status(409).json({
        message: booking.leasing?.decision === "refuse"
          ? "Ce financement a été refusé — la commande ne peut plus progresser."
          : "Cette demande de financement est encore en cours d'étude par notre équipe.",
      });
    }

    const wasPaidBeforeCancel = booking.isPaid;

    booking.status = status;
    if (status === "cancelled") {
      booking.cancelledAt      = new Date();
      booking.cancelReason     = cancelReason ? String(cancelReason).trim().slice(0, 500) : null;
      booking.cancelReasonCode = cancelReasonCode;
      booking.cancelledBy      = req.user.role === "admin" ? "admin" : "partenaire";
    }
    await booking.save();

    if (status === "cancelled" && wasPaidBeforeCancel && global._io) {
      // Voir cancelBookingByClient — même signalement, aucune automatisation
      // de remboursement pour l'instant.
      global._io.to("admins").emit("refund_needed", {
        bookingId: booking._id.toString(), reference: booking.reference,
        reason: "Réservation payée annulée par le partenaire — remboursement à traiter manuellement.",
      });
    }

    // ── Synchronisation temps réel (Socket.io) ─────────────────────────────
    emitBookingUpdate(booking);

    // Sync disponibilité du véhicule (non bloquant)
    syncVehicleAvailability(booking.vehicle?._id || booking.vehicle);

    // ── Contrat auto à la confirmation ─────────────────────────────────────────
    if (status === "confirmed" && !booking.contract) {
      try {
        const veh = booking.vehicle;
        const ci  = booking.clientInfo;
        const contract = await Contract.create({
          booking: booking._id,
          type:    booking.type,
          currency: booking.devise || "USD",
          client: {
            firstName: ci?.firstName,
            lastName:  ci?.lastName,
            email:     ci?.email,
            phone:     ci?.phone,
            idType:    booking.clientVerification?.idType,
            idNumber:  booking.clientVerification?.idNumber,
          },
          vendor: {
            name:  veh?.contactNom || req.user.firstName || "",
            email: req.user.email,
            phone: veh?.contactTel || "",
          },
          vehicle: {
            name:    veh ? [veh.title, veh.marque, veh.modele].filter(Boolean).join(" ") : "",
            brand:   veh?.marque,
            year:    veh?.annee,
            color:   veh?.couleur,
            mileage: veh?.kilometrage,
          },
          terms: {
            startDate:        booking.location?.startDate,
            endDate:          booking.location?.endDate,
            days:             booking.location?.days,
            pickupLocation:   booking.location?.pickupLocation,
            returnLocation:   booking.location?.returnLocation,
            dailyRateXOF:     veh?.pricePerDay,
            cautionXOF:       booking.cautionAmount ?? 0,
            serviceFeeXOF:    booking.serviceFeeFCFA ?? 1,
            optionsXOF:       booking.montantOptions ?? 0,
            baseXOF:          booking.montantBase,
            totalXOF:         booking.montantTotal,
            commissionRate:   booking.commissionRate,
            commissionXOF:    booking.commissionAmount,
            partnerPayoutXOF: booking.partnerPayout,
            apportInitial:    booking.leasing?.apportInitial ?? 0,
            mensualite:       booking.leasing?.mensualite    ?? 0,
            dureeLeasing:     booking.leasing?.duree         ?? 0,
            tauxInteret:      booking.leasing?.tauxInteret   ?? 0,
            totalLeasing:     booking.leasing?.totalLeasing  ?? 0,
          },
          status: "sent",
        });
        booking.contract = contract._id;
        await booking.save();
      } catch (contractErr) {
        logger.error("Auto-contrat échoué (non bloquant) :", contractErr.message);
      }
    }

    // ── Notifications client ────────────────────────────────────────────────────
    const ref = booking.reference || "";
    const notifs = {
      confirmed:                  { type: "booking_confirmed", titre: "✅ Réservation acceptée",      msg: `Votre réservation ${ref} a été acceptée par le partenaire.` },
      preparing:                  { type: "system",            titre: "⚙️ Préparation en cours",      msg: "Le partenaire prépare votre véhicule." },
      ready:                      { type: "system",            titre: "🚗 Véhicule prêt !",            msg: "Votre véhicule est prêt. Le partenaire va vous contacter." },
      in_progress:                { type: "system",            titre: "🚀 En route vers vous !",       msg: "Le partenaire est en route. Préparez votre pièce d'identité." },
      client_arrived:             { type: "system",            titre: "📍 Rendez-vous confirmé",      msg: "Le partenaire a confirmé votre présence au rendez-vous." },
      client_absent:              { type: "system",            titre: "⚠️ Absence signalée",          msg: "Le partenaire a signalé votre absence au rendez-vous." },
      transaction_concluded:      { type: "system",            titre: "💰 Transaction enregistrée",   msg: `Le partenaire a enregistré la transaction. Veuillez la valider.` },
      transaction_not_concluded:  { type: "system",            titre: "❌ Transaction non conclue",   msg: "Le partenaire a signalé que la transaction n'a pas abouti." },
      waiting_client_validation:  { type: "system",            titre: "✋ Validation requise",        msg: `Confirmez la transaction pour ${ref}. Vérifiez les détails dans votre tableau de bord.`, lien: "/dashboard" },
      completed:                  { type: "booking_completed", titre: "🏁 Commande terminée",         msg: `Merci pour votre confiance ! (${ref}) Laissez un avis.` },
      cancelled:                  { type: "booking_cancelled", titre: "❌ Réservation annulée",       msg: `Votre réservation ${ref} a été annulée. Motif : ${PARTNER_CANCEL_REASONS_MAP[cancelReasonCode] || cancelReasonCode}${cancelReason ? ` — ${cancelReason}` : ""}` },
      disputed:                   { type: "system",            titre: "⚠️ Litige signalé",            msg: `Un litige a été ouvert sur la commande ${ref}.`, lien: "/dashboard" },
    };
    const n = notifs[status];
    if (n && booking.client) {
      await notify(booking.client, n.type, n.titre, n.msg, n.lien || "/dashboard");
    }
    if (status === "completed") { await markVehicleSoldIfApplicable(booking); schedulePostServiceSurvey(booking); issueServiceInvoice(booking); await recordPartnerPayout(booking); }

    res.json({ booking });
  } catch (err) {
    logger.error("updateBookingStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. WORKFLOW PARTENAIRE : ENREGISTRER LA TRANSACTION CONCLUE (CASH)
// ═══════════════════════════════════════════════════════════════════════════════
export const recordTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { finalAmount, paymentMethod, comment, financing } = req.body;

    if (!finalAmount || finalAmount <= 0) {
      return res.status(400).json({ message: "Montant final requis et doit être positif." });
    }
    if (finalAmount > 500_000_000) {
      return res.status(400).json({ message: "Montant anormalement élevé — veuillez contacter le support." });
    }
    const allowedMethods = ["cash", "card", "orange_money", "wave", "mtn", "moov", "paypal", "virement"];
    if (!paymentMethod || !allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({ message: `Mode de paiement invalide. Acceptés : ${allowedMethods.join(", ")}` });
    }
    // Mode de financement réellement conclu (essai/vente uniquement) — optionnel,
    // "comptant" par défaut pour tous les autres services (location, chauffeur...).
    const allowedFinancingTypes = ["comptant", "leasing", "credit"];
    const financingType = financing?.type && allowedFinancingTypes.includes(financing.type) ? financing.type : "comptant";
    if (financingType !== "comptant" && (!financing?.mensualite || financing.mensualite <= 0)) {
      return res.status(400).json({ message: "Mensualité requise pour un financement leasing/crédit." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "owner")
      .populate("driver",  "owner");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });

    // Cap : le montant final ne peut pas dépasser 10× le montant estimé (protection fraude)
    if (booking.montantTotal && finalAmount > booking.montantTotal * 10) {
      return res.status(400).json({ message: "Montant final incohérent avec le devis initial. Contactez le support." });
    }

    const _vOwnerId = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
    const _dOwnerId  = booking.driver?.owner?._id?.toString()  || booking.driver?.owner?.toString();
    const _userId    = req.user._id.toString();
    const isOwner = (_vOwnerId && _vOwnerId === _userId) || (_dOwnerId && _dOwnerId === _userId);

    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    if (booking.status !== "client_arrived") {
      return res.status(409).json({ message: `Impossible d'enregistrer la transaction depuis le statut "${booking.status}". Le client doit d'abord être marqué comme arrivé.` });
    }

    // Recalcul commission sur montant final réel — `?? 0` (jamais `|| 1`,
    // bug réel corrigé en audit) : un serviceFeeFCFA légitimement à 0 aurait
    // sinon été remplacé par 1, grignotant 1 USD sur le partnerPayout.
    const commissionRate   = await resolveCommissionRate(booking.type, _vOwnerId || _dOwnerId);
    const commissionAmount = Math.round(finalAmount * commissionRate * 100) / 100;
    const partnerPayout    = Math.max(finalAmount - commissionAmount - (booking.serviceFeeFCFA ?? 0), 0);

    booking.transaction = {
      finalAmount,
      paymentMethod,
      comment:     comment || null,
      recordedAt:  new Date(),
      recordedBy:  req.user._id,
      financing: {
        type:          financingType,
        apportInitial: financingType !== "comptant" ? Number(financing?.apportInitial) || 0 : 0,
        mensualite:    financingType !== "comptant" ? Number(financing?.mensualite)    || 0 : 0,
        duree:         financingType !== "comptant" ? Number(financing?.duree)         || 0 : 0,
        tauxInteret:   financingType !== "comptant" ? Number(financing?.tauxInteret)   || 0 : 0,
      },
    };
    booking.commissionRate   = commissionRate;
    booking.commissionAmount = commissionAmount;
    booking.partnerPayout    = partnerPayout;
    booking.montantTotal     = finalAmount;
    booking.status           = "waiting_client_validation";

    // Si paiement en espèces, créer l'enregistrement Payment
    if (paymentMethod === "cash") {
      const payment = await Payment.create({
        booking: booking._id,
        amount:  finalAmount,
        devise:  booking.devise || "USD",
        method:  "cash",
        status:  "pending",  // En attente de validation client
        paymentDetails: { provider: "cash" },
      });
      booking.payment = payment._id;
    }

    await booking.save();

    // ── Socket.io : notifier le client en temps réel ───────────────────────
    emitBookingUpdate(booking, "booking_updated", {
      amount:        finalAmount,
      paymentMethod,
      requiresValidation: true,
    });

    // Notifier le client (in-app)
    if (booking.client) {
      await notify(
        booking.client,
        "system",
        "✋ Validation requise",
        `Le partenaire a enregistré votre transaction de ${Number(finalAmount).toLocaleString("fr-FR")} ${booking.devise || "USD"}. Veuillez valider dans votre tableau de bord.`,
        "/dashboard"
      );
    }

    res.json({ booking, message: "Transaction enregistrée. En attente de validation client." });
  } catch (err) {
    logger.error("recordTransaction:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. WORKFLOW CLIENT : VALIDER OU CONTESTER LA TRANSACTION
// ═══════════════════════════════════════════════════════════════════════════════
export const validateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, disputeReason } = req.body;  // action: "validate" | "dispute"

    if (!["validate", "dispute"].includes(action)) {
      return res.status(400).json({ message: "Action invalide. Utilisez 'validate' ou 'dispute'." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "owner title marque modele")
      .populate("driver",  "owner firstName lastName");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });

    // Vérification stricte : seul le client lié par ID (ou admin) peut valider
    const isClientById = booking.client?.toString() === req.user._id.toString();

    if (!isClientById && req.user.role !== "admin") {
      return res.status(403).json({ message: "Seul le client concerné peut valider cette transaction." });
    }

    if (booking.status !== "waiting_client_validation") {
      return res.status(409).json({ message: "Cette transaction n'est pas en attente de validation." });
    }

    const ownerId = booking.vehicle?.owner || booking.driver?.owner;

    if (action === "validate") {
      booking.status = "completed";
      booking.clientValidation = { validatedAt: new Date(), disputedAt: null, disputeReason: null };
      booking.isPaid  = true;
      booking.paidAt  = new Date();

      // Finaliser le paiement
      if (booking.payment) {
        await Payment.findByIdAndUpdate(booking.payment, { status: "completed" });
      }

      // Notifier le partenaire
      await notify(
        ownerId,
        "booking_completed",
        "✅ Transaction validée",
        `Le client a validé la transaction ${booking.reference}. Commission VIT-AUTO : ${Number(booking.commissionAmount).toLocaleString("fr-FR")} ${booking.devise || "USD"}.`,
        "/vendor/dashboard"
      );

      // Reçu PDF automatique par email — couvre notamment le règlement en
      // espèces sur place, qui ne passe jamais par un webhook de paiement.
      dispatch.transactionReceiptReady(booking, booking.clientInfo?.email, booking.client).catch(() => {});
      schedulePostServiceSurvey(booking);
      issueServiceInvoice(booking);
      await recordPartnerPayout(booking);
    } else {
      booking.status = "disputed";
      booking.clientValidation = {
        validatedAt:   null,
        disputedAt:    new Date(),
        disputeReason: disputeReason || "Problème signalé sans détail.",
      };

      // Notifier partenaire et admin
      await notify(
        ownerId,
        "system",
        "⚠️ Litige ouvert",
        `Le client a signalé un problème sur la commande ${booking.reference} : ${disputeReason || "Aucun détail fourni."}`,
        "/vendor/dashboard"
      );
      await notifyAdmins(
        "system",
        "⚠️ Nouveau litige à traiter",
        `Litige ouvert sur la commande ${booking.reference} : ${disputeReason || "Aucun détail fourni."}`,
        "/admin"
      ).catch(() => {});
    }

    await booking.save();

    // ── Socket.io : notifier le partenaire en temps réel ──────────────────
    emitBookingUpdate(booking);

    // Sync disponibilité (quand terminée ou litige → véhicule peut redevenir dispo)
    if (action === "validate") {
      await markVehicleSoldIfApplicable(booking);
      syncVehicleAvailability(booking.vehicle?._id || booking.vehicle);
    }

    res.json({ booking, message: action === "validate" ? "Transaction validée avec succès." : "Litige enregistré. Notre équipe vous contactera." });
  } catch (err) {
    logger.error("validateTransaction:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8b. DATES BLOQUÉES D'UN VÉHICULE (pour calendrier de réservation)
// ═══════════════════════════════════════════════════════════════════════════════
export const getVehicleOccupiedDates = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ message: "vehicleId invalide." });
    }

    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation",
    ];

    const bookings = await Booking.find({
      vehicle: vehicleId,
      status:  { $in: activeStatuses },
      "location.startDate": { $exists: true },
      "location.endDate":   { $exists: true },
    }).select("location.startDate location.endDate status reference -_id");

    const occupied = bookings.map((b) => ({
      startDate: b.location.startDate,
      endDate:   b.location.endDate,
      status:    b.status,
      reference: b.reference || "",
    }));

    // Générer la liste de tous les jours bloqués
    const blockedDays = new Set();
    for (const { startDate, endDate } of occupied) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      const cur = new Date(s);
      while (cur <= e) {
        blockedDays.add(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
    }

    res.json({
      vehicleId,
      occupied,
      blockedDays: Array.from(blockedDays).sort(),
    });
  } catch (err) {
    logger.error("getVehicleOccupiedDates:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8c. CRÉNEAUX OCCUPÉS D'UN CHAUFFEUR (pour éviter un double-booking visible côté client)
// ═══════════════════════════════════════════════════════════════════════════════
export const getDriverOccupiedSlots = async (req, res) => {
  try {
    const { driverId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ message: "driverId invalide." });
    }

    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation",
    ];

    const [bookings, driver] = await Promise.all([
      Booking.find({
        driver:  driverId,
        status:  { $in: activeStatuses },
        "chauffeur.date":    { $exists: true },
        "chauffeur.dateFin": { $exists: true },
      }).select("chauffeur.date chauffeur.dateFin status reference -_id"),
      Driver.findById(driverId).select("blackoutDates"),
    ]);

    const occupied = bookings.map((b) => ({
      date:      b.chauffeur.date,
      dateFin:   b.chauffeur.dateFin,
      status:    b.status,
      reference: b.reference || "",
    }));

    // Congés bloqués par le partenaire (voir driverController.addDriverBlackout)
    // — jusqu'ici invisibles côté client, un créneau "congé" apparaissait
    // comme disponible dans le calendrier de réservation.
    const blackout = (driver?.blackoutDates || []).map((b) => ({
      date:      b.start,
      dateFin:   b.end,
      status:    "conge",
      reference: b.reason || "Indisponible",
    }));

    res.json({ driverId, occupied: [...occupied, ...blackout] });
  } catch (err) {
    logger.error("getDriverOccupiedSlots:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8d. CRÉNEAUX OCCUPÉS D'ESSAI (véhicule en vente — évite deux essais sur le même créneau)
// ═══════════════════════════════════════════════════════════════════════════════
export const getEssaiOccupiedSlots = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ message: "vehicleId invalide." });
    }

    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation",
    ];

    const bookings = await Booking.find({
      vehicle: vehicleId,
      type:    "essai",
      status:  { $in: activeStatuses },
      "essai.preferredDate": { $exists: true },
      "essai.dateFin":       { $exists: true },
    }).select("essai.preferredDate essai.dateFin status reference -_id");

    const occupied = bookings.map((b) => ({
      date:      b.essai.preferredDate,
      dateFin:   b.essai.dateFin,
      status:    b.status,
      reference: b.reference || "",
    }));

    res.json({ vehicleId, occupied });
  } catch (err) {
    logger.error("getEssaiOccupiedSlots:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8. STATISTIQUES PARTENAIRE (pour dashboard)
// ═══════════════════════════════════════════════════════════════════════════════
export const getPartnerStats = async (req, res) => {
  try {
    const { year, month, businessId } = req.query;
    const vehicleFilter = { owner: req.user._id };
    const driverFilter  = { owner: req.user._id };
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      vehicleFilter.business = businessId;
      driverFilter.business  = businessId;
    }
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find(vehicleFilter).select("_id"),
      Driver.find(driverFilter).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);

    // Filtre optionnel par mois/année pour les rapports mensuels
    let dateFilter = {};
    if (year && /^\d{4}$/.test(year)) {
      const y = Number(year);
      const m = month && /^(1[0-2]|[1-9])$/.test(month) ? Number(month) : null;
      dateFilter.createdAt = m
        ? { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) }
        : { $gte: new Date(y, 0, 1),     $lt: new Date(y + 1, 0, 1) };
    }

    // Une seule agrégation groupée par statut, calculée en base plutôt que de rapatrier
    // tous les bookings du partenaire (potentiellement des milliers) pour les réduire en JS.
    const statsAgg = await Booking.aggregate([
      {
        $match: {
          $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }],
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: "$status",
          count:      { $sum: 1 },
          revenue:    { $sum: { $ifNull: ["$transaction.finalAmount", { $ifNull: ["$montantTotal", 0] }] } },
          commission: { $sum: { $ifNull: ["$commissionAmount", 0] } },
          payout:     { $sum: { $ifNull: ["$partnerPayout", 0] } },
        },
      },
    ]);

    const byStatus = Object.fromEntries(statsAgg.map((g) => [g._id, g.count]));
    const completedGroup = statsAgg.find((g) => g._id === "completed");
    const total = statsAgg.reduce((s, g) => s + g.count, 0);
    const inProgress = ["preparing", "ready", "in_progress", "client_arrived"]
      .reduce((s, st) => s + (byStatus[st] || 0), 0);

    res.json({
      total,
      pending:       byStatus.pending || 0,
      confirmed:     byStatus.confirmed || 0,
      inProgress,
      waitingValidation: byStatus.waiting_client_validation || 0,
      completed:     byStatus.completed || 0,
      cancelled:     byStatus.cancelled || 0,
      disputed:      byStatus.disputed || 0,
      totalRevenue:    completedGroup?.revenue || 0,
      totalCommission: completedGroup?.commission || 0,
      totalPayout:     completedGroup?.payout || 0,
    });
  } catch (err) {
    logger.error("getPartnerStats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8b2. ANALYTIQUE PARTENAIRE — tendance mensuelle, top véhicules, occupation,
//      clientèle récurrente (GET /partner/analytics)
// ═══════════════════════════════════════════════════════════════════════════════
// getPartnerStats (ci-dessus) ne renvoie que des totaux agrégés — un partenaire
// gérant une flotte n'avait aucun moyen de voir l'évolution dans le temps, ses
// véhicules les plus rentables, ni ses clients réguliers. Manque réel trouvé en audit.
export const getPartnerAnalytics = async (req, res) => {
  try {
    const { businessId } = req.query;
    const vehicleFilter = { owner: req.user._id };
    const driverFilter  = { owner: req.user._id };
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      vehicleFilter.business = businessId;
      driverFilter.business  = businessId;
    }
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find(vehicleFilter).select("_id title marque modele"),
      Driver.find(driverFilter).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);
    const scopeMatch = { $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }] };

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [monthlyAgg, topVehiclesAgg, clientsAgg] = await Promise.all([
      // ── Tendance mensuelle (6 derniers mois, commandes terminées) ─────────
      Booking.aggregate([
        { $match: { ...scopeMatch, status: "completed", createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id:     { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
            revenue: { $sum: { $ifNull: ["$partnerPayout", 0] } },
            count:   { $sum: 1 },
          },
        },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),
      // ── Top véhicules par revenu net (commandes terminées, location/vente) ─
      Booking.aggregate([
        { $match: { vehicle: { $in: vehicleIds }, status: "completed" } },
        {
          $group: {
            _id:     "$vehicle",
            revenue: { $sum: { $ifNull: ["$partnerPayout", 0] } },
            count:   { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
      // ── Clientèle : regroupée par client connecté, sinon par email (invité) ─
      Booking.aggregate([
        { $match: scopeMatch },
        {
          $group: {
            _id:          { $ifNull: ["$client", "$clientInfo.email"] },
            firstName:    { $last: "$clientInfo.firstName" },
            lastName:     { $last: "$clientInfo.lastName" },
            email:        { $last: "$clientInfo.email" },
            phone:        { $last: "$clientInfo.phone" },
            totalBookings:{ $sum: 1 },
            completed:    { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            totalSpent:   { $sum: { $cond: [{ $eq: ["$status", "completed"] }, { $ifNull: ["$partnerPayout", 0] }, 0] } },
            lastBookingAt:{ $max: "$createdAt" },
          },
        },
        { $sort: { totalBookings: -1 } },
        { $limit: 30 },
      ]),
    ]);

    const monthlyRevenue = monthlyAgg.map((g) => ({
      month:   `${g._id.y}-${String(g._id.m).padStart(2, "0")}`,
      revenue: g.revenue,
      count:   g.count,
    }));

    const vehicleById = new Map(myVehicles.map((v) => [v._id.toString(), v]));
    const topVehicles = topVehiclesAgg.map((g) => {
      const veh = vehicleById.get(g._id?.toString());
      return {
        vehicleId: g._id,
        title:     veh ? [veh.title, veh.marque, veh.modele].filter(Boolean).join(" ") : "Véhicule",
        revenue:   g.revenue,
        count:     g.count,
      };
    });

    const topClients = clientsAgg.map((g) => ({
      clientId:      typeof g._id === "object" ? g._id : null,
      firstName:     g.firstName,
      lastName:      g.lastName,
      email:         g.email,
      phone:         g.phone,
      totalBookings: g.totalBookings,
      completed:     g.completed,
      totalSpent:    g.totalSpent,
      lastBookingAt: g.lastBookingAt,
    }));

    // ── Occupation approximative (30 derniers jours, location uniquement) ───
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 30);
    const occupancyAgg = await Booking.aggregate([
      {
        $match: {
          vehicle: { $in: vehicleIds },
          type:    "location",
          status:  { $in: ["confirmed", "preparing", "ready", "in_progress", "client_arrived", "waiting_client_validation", "completed"] },
          "location.startDate": { $gte: periodStart },
        },
      },
      { $group: { _id: null, totalDays: { $sum: { $ifNull: ["$location.days", 0] } } } },
    ]);
    const fleetSize = myVehicles.length || 1;
    const occupancyRate = Math.min(100, Math.round(((occupancyAgg[0]?.totalDays || 0) / (fleetSize * 30)) * 100));

    res.json({ monthlyRevenue, topVehicles, topClients, occupancyRate, fleetSize });
  } catch (err) {
    logger.error("getPartnerAnalytics:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8b3. EXPORT COMPTABLE PARTENAIRE (GET /partner/export) — CSV pour tenue de
//      compte, jusqu'ici réservé à l'admin (exportBookings, /admin/export) :
//      un partenaire n'avait strictement aucun moyen de télécharger l'historique
//      de ses commandes pour sa propre comptabilité. Manque réel trouvé en audit.
// ═══════════════════════════════════════════════════════════════════════════════
export const exportPartnerBookings = async (req, res) => {
  try {
    const { dateFrom, dateTo, businessId } = req.query;
    const vehicleFilter = { owner: req.user._id };
    const driverFilter  = { owner: req.user._id };
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      vehicleFilter.business = businessId;
      driverFilter.business  = businessId;
    }
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find(vehicleFilter).select("_id"),
      Driver.find(driverFilter).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);

    const filter = { $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }] };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .populate("vehicle", "title marque modele")
      .populate("driver",  "firstName lastName")
      .lean();

    const rows = [
      "Reference,Type,Statut,Client,Email,Vehicule/Chauffeur,Montant,Commission,Net Partenaire,Caution retenue,Devise,Date,Paye",
      ...bookings.map((b) => [
        b.reference || b._id,
        b.type,
        b.status,
        `${b.clientInfo?.firstName || ""} ${b.clientInfo?.lastName || ""}`.trim(),
        b.clientInfo?.email || "",
        b.vehicle?.title || (b.driver ? `${b.driver.firstName || ""} ${b.driver.lastName || ""}`.trim() : ""),
        b.montantTotal || 0,
        b.commissionAmount || 0,
        b.partnerPayout || 0,
        b.cautionClaim?.amountClaimed || 0,
        b.devise || "USD",
        b.createdAt?.toISOString().slice(0, 10) || "",
        b.isPaid ? "Oui" : "Non",
      ].join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="mes-commandes-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + rows); // BOM UTF-8 pour Excel
  } catch (err) {
    logger.error("exportPartnerBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8c. VALIDATION COMPLÈTE PARTENAIRE (présence + transaction en une seule action)
//     PATCH /:id/partner-confirm
// ═══════════════════════════════════════════════════════════════════════════════
export const partnerConfirm = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      clientPresent,   // boolean
      finalAmount,     // number
      paymentMethod,   // string
      comment,         // string optionnel
      financing,       // objet optionnel { type, apportInitial, mensualite, duree, tauxInteret }
    } = req.body;

    if (typeof clientPresent !== "boolean") {
      return res.status(400).json({ message: "clientPresent (boolean) est requis." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "owner title")
      .populate("driver",  "owner firstName lastName");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });

    const _vOwnerId = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
    const _dOwnerId  = booking.driver?.owner?._id?.toString()  || booking.driver?.owner?.toString();
    const _userId    = req.user._id.toString();
    const isOwner = (_vOwnerId && _vOwnerId === _userId) || (_dOwnerId && _dOwnerId === _userId);

    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    if (!["confirmed", "preparing", "ready", "in_progress"].includes(booking.status)) {
      return res.status(409).json({
        message: `Impossible de confirmer depuis le statut "${booking.status}".`,
      });
    }

    if (!clientPresent) {
      booking.status = "client_absent";
      await booking.save();
      if (booking.client) {
        await notify(booking.client, "system", "⚠️ Absence signalée",
          `Le partenaire a signalé votre absence au rendez-vous (${booking.reference}).`, "/dashboard");
      }
      return res.json({ booking, message: "Absence du client enregistrée." });
    }

    // Client présent — enregistrement transaction obligatoire
    const allowedMethods = ["cash", "card", "orange_money", "wave", "mtn", "moov", "paypal", "virement"];
    if (!finalAmount || finalAmount <= 0) {
      return res.status(400).json({ message: "Le montant final est requis quand le client est présent." });
    }
    // Mêmes plafonds anti-fraude que recordTransaction (même opération :
    // enregistrer un montant final) — absents ici jusqu'à ce correctif, un
    // partenaire pouvait imposer un montant final arbitraire sans aucun
    // garde-fou (bug réel trouvé en audit).
    if (finalAmount > 500_000_000) {
      return res.status(400).json({ message: "Montant anormalement élevé — veuillez contacter le support." });
    }
    if (booking.montantTotal && finalAmount > booking.montantTotal * 10) {
      return res.status(400).json({ message: "Montant final incohérent avec le devis initial. Contactez le support." });
    }
    if (!paymentMethod || !allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({ message: `Mode de paiement invalide. Acceptés : ${allowedMethods.join(", ")}` });
    }
    const allowedFinancingTypes = ["comptant", "leasing", "credit"];
    const financingType = financing?.type && allowedFinancingTypes.includes(financing.type) ? financing.type : "comptant";
    if (financingType !== "comptant" && (!financing?.mensualite || financing.mensualite <= 0)) {
      return res.status(400).json({ message: "Mensualité requise pour un financement leasing/crédit." });
    }

    const commissionRate   = await resolveCommissionRate(booking.type, _vOwnerId || _dOwnerId);
    const commissionAmount = Math.round(finalAmount * commissionRate * 100) / 100;
    const partnerPayout    = Math.max(finalAmount - commissionAmount - (booking.serviceFeeFCFA ?? 0), 0);

    booking.status = "waiting_client_validation";
    booking.transaction = {
      finalAmount,
      paymentMethod,
      comment:    comment || null,
      recordedAt: new Date(),
      recordedBy: req.user._id,
      financing: {
        type:          financingType,
        apportInitial: financingType !== "comptant" ? Number(financing?.apportInitial) || 0 : 0,
        mensualite:    financingType !== "comptant" ? Number(financing?.mensualite)    || 0 : 0,
        duree:         financingType !== "comptant" ? Number(financing?.duree)         || 0 : 0,
        tauxInteret:   financingType !== "comptant" ? Number(financing?.tauxInteret)   || 0 : 0,
      },
    };
    booking.commissionRate   = commissionRate;
    booking.commissionAmount = commissionAmount;
    booking.partnerPayout    = partnerPayout;
    booking.montantTotal     = finalAmount;

    if (paymentMethod === "cash") {
      const payment = await Payment.create({
        booking: booking._id,
        amount:  finalAmount,
        devise:  booking.devise || "USD",
        method:  "cash",
        status:  "pending",
        paymentDetails: { provider: "cash" },
      });
      booking.payment = payment._id;
    }

    await booking.save();

    if (booking.client) {
      await notify(
        booking.client,
        "system",
        "✋ Confirmez votre transaction",
        `Le partenaire a enregistré votre transaction de ${Number(finalAmount).toLocaleString("fr-FR")} ${booking.devise || "USD"} (${paymentMethod}). Confirmez dans votre tableau de bord.`,
        "/dashboard"
      );
    }

    // Émettre un événement Socket.io si disponible
    if (global._io) {
      global._io.to(`partner_${req.user._id}`).emit("booking_updated", {
        bookingId: booking._id,
        status:    "waiting_client_validation",
        reference: booking.reference,
      });
      if (booking.client) {
        global._io.to(`user_${booking.client}`).emit("validation_required", {
          bookingId: booking._id,
          reference: booking.reference,
          amount:    finalAmount,
          method:    paymentMethod,
        });
      }
    }

    res.json({
      booking,
      commissionAmount,
      partnerPayout,
      message: "Présence et transaction enregistrées. En attente de validation client.",
    });
  } catch (err) {
    logger.error("partnerConfirm:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10. DÉTAIL COMPLET D'UNE RÉSERVATION (admin + partenaire)
//     GET /:id/detail
// ═══════════════════════════════════════════════════════════════════════════════
export const getBookingDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    // Vérification d'autorisation AVANT de charger les données sensibles
    const rawBooking = await Booking.findById(id)
      .select("vehicle driver client")
      .populate("vehicle", "owner")
      .populate("driver",  "owner");

    if (!rawBooking) return res.status(404).json({ message: "Commande introuvable." });

    if (req.user.role !== "admin") {
      const uid      = req.user._id.toString();
      const vOwner   = rawBooking.vehicle?.owner?._id?.toString() || rawBooking.vehicle?.owner?.toString();
      const dOwner   = rawBooking.driver?.owner?._id?.toString()  || rawBooking.driver?.owner?.toString();
      const clientId = rawBooking.client?.toString();
      const hasAccess = (vOwner && vOwner === uid) || (dOwner && dOwner === uid) || (clientId && clientId === uid);
      if (!hasAccess) return res.status(403).json({ message: "Accès refusé." });
    }

    // Charger les données complètes uniquement après autorisation vérifiée
    // Les partenaires ne voient PAS les données OCR biométriques du client
    const isAdmin = req.user.role === "admin";
    const uid = req.user._id.toString();
    const vOwner = rawBooking.vehicle?.owner?._id?.toString() || rawBooking.vehicle?.owner?.toString();
    const dOwner = rawBooking.driver?.owner?._id?.toString()  || rawBooking.driver?.owner?.toString();
    const isPartnerOwner = (vOwner && vOwner === uid) || (dOwner && dOwner === uid);

    const clientFields = isAdmin
      ? "firstName lastName email phone kycStatus kycScore kycBadge kycOcrData kycFaceMatchScore driverLicenseOcr emailVerified phoneVerified"
      : isPartnerOwner
        ? "firstName lastName email phone kycStatus emailVerified phoneVerified"  // pas les données biométriques
        : "firstName lastName email phone kycStatus";

    const booking = await Booking.findById(id)
      .populate("client",   clientFields)
      .populate("vehicle",  "title marque modele owner images pricePerDay contactNom contactTel")
      .populate("driver",   "firstName lastName phone owner tarif")
      .populate("payment",  "method status amount devise createdAt")
      .populate("contract", "reference status createdAt");

    res.json({ booking });
  } catch (err) {
    logger.error("getBookingDetail:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 11. VÉRIFICATION KYC MANUELLE PAR LE PARTENAIRE — PATCH /:id/partner-kyc-verify
// ═══════════════════════════════════════════════════════════════════════════════
export const partnerVerifyKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, note } = req.body; // decision: "verifie" | "rejete"

    if (!["verifie", "rejete"].includes(decision)) {
      return res.status(400).json({ message: "decision doit être 'verifie' ou 'rejete'." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "owner")
      .populate("driver",  "owner");
    if (!booking) return res.status(404).json({ message: "Commande introuvable." });

    const _vOwnerId = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
    const _dOwnerId  = booking.driver?.owner?._id?.toString()  || booking.driver?.owner?.toString();
    const _userId    = req.user._id.toString();
    const isOwner = (_vOwnerId && _vOwnerId === _userId) || (_dOwnerId && _dOwnerId === _userId);

    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    booking.partnerKycVerification = {
      status:     decision,
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
      note:       note || null,
    };
    await booking.save();

    if (booking.client && decision === "rejete") {
      await notify(
        booking.client,
        "system",
        "⚠️ Vérification identité",
        `Le partenaire a signalé un problème avec votre pièce d'identité sur la réservation ${booking.reference}. Contactez le support.`,
        "/dashboard"
      );
    }

    res.json({
      booking,
      message: decision === "verifie"
        ? "Identité client vérifiée en présentiel."
        : "Identité client rejetée — client notifié.",
    });
  } catch (err) {
    logger.error("partnerVerifyKyc:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8e. MODIFICATION DES DATES PAR LE CLIENT — PATCH /:id/modify
// ═══════════════════════════════════════════════════════════════════════════════
// Jusqu'ici un client ne pouvait que tout annuler puis recommencer une nouvelle
// réservation — aucun moyen de simplement changer les dates d'une location pas
// encore commencée. Manque réel trouvé en audit.
export const modifyBookingDates = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Identifiant de réservation invalide." });
    }

    const booking = await Booking.findById(id).populate("vehicle");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
    if (booking.type !== "location") {
      return res.status(400).json({ message: "Seules les locations peuvent être modifiées." });
    }

    const userId = req.user?.id || req.user?._id;
    const isOwnerById    = booking.client && booking.client.toString() === userId?.toString();
    const isOwnerByEmail = !booking.client && req.user?.emailVerified === true
      && booking.clientInfo?.email?.toLowerCase() === req.user?.email?.toLowerCase();
    if (!isOwnerById && !isOwnerByEmail) {
      return res.status(403).json({ message: "Accès refusé à cette réservation." });
    }

    if (!["pending", "confirmed"].includes(booking.status)) {
      return res.status(409).json({ message: `Impossible de modifier une réservation avec le statut "${booking.status}".` });
    }

    const newStart = new Date(startDate);
    const newEnd   = new Date(endDate);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return res.status(400).json({ message: "Dates invalides (fin après début requis)." });
    }
    if (newStart < new Date()) {
      return res.status(400).json({ message: "La nouvelle date de début ne peut pas être dans le passé." });
    }

    const days = Math.max(1, Math.round((newEnd - newStart) / 86400000));
    const effectivePricePerDay = applyPromotion(booking.vehicle.pricePerDay || 0, days, booking.vehicle.promotions);
    const newMontantBase = effectivePricePerDay * days;
    const priceDelta = newMontantBase - (booking.montantBase || 0);
    const newCommissionAmount = Math.round((newMontantBase + (booking.montantOptions || 0) + (booking.location.deliveryFee || 0)) * (booking.commissionRate || 0) * 100) / 100;
    const newMontantTotal = newMontantBase + (booking.montantOptions || 0) + (booking.location.deliveryFee || 0);

    // Contrôle de chevauchement + écriture dans une transaction — même pattern
    // que createBooking (bug réel corrigé en audit) : le contrôle précédent
    // (findOne puis booking.save() séparés) laissait une fenêtre où deux
    // requêtes concurrentes (modification + nouvelle réservation sur la
    // période juste après) passaient toutes deux le contrôle avant qu'aucune
    // n'ait écrit, aboutissant à une double occupation du même véhicule.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const conflict = await Booking.findOne({
          _id:     { $ne: booking._id },
          vehicle: booking.vehicle._id,
          status:  { $in: ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation"] },
          "location.startDate": { $lt: newEnd },
          "location.endDate":   { $gt: newStart },
        }).session(session);
        if (conflict) {
          throw Object.assign(new Error("VEHICLE_CONFLICT"), { conflict });
        }
        booking.location.startDate = newStart;
        booking.location.endDate   = newEnd;
        booking.location.days      = days;
        booking.montantBase  = newMontantBase;
        booking.montantTotal = newMontantTotal;
        booking.commissionAmount = newCommissionAmount;
        booking.partnerPayout    = Math.max(newMontantTotal - newCommissionAmount - (booking.serviceFeeFCFA || 0), 0);
        await booking.save({ session });
      });
    } catch (txErr) {
      if (txErr.conflict) {
        return res.status(409).json({ message: "Le véhicule est déjà réservé sur ces nouvelles dates." });
      }
      throw txErr;
    } finally {
      await session.endSession();
    }

    emitBookingUpdate(booking);
    await syncVehicleAvailability(booking.vehicle._id);

    const ownerId = booking.vehicle.owner;
    if (ownerId) {
      await notify(ownerId, "system", "📅 Dates de réservation modifiées",
        `Le client a modifié les dates de la réservation ${booking.reference || ""} (${days} jour(s), du ${newStart.toLocaleDateString("fr-FR")} au ${newEnd.toLocaleDateString("fr-FR")}).`,
        "/vendor/dashboard");
    }

    res.json({ booking, priceDelta });
  } catch (err) {
    logger.error("modifyBookingDates:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8f. PROLONGATION DE LOCATION — PATCH /:id/extend
// ═══════════════════════════════════════════════════════════════════════════════
// Distinct de modifyBookingDates ci-dessus : celle-ci ne permet de changer les
// dates qu'AVANT le début de la location ("pending"/"confirmed"). Un client qui
// a déjà pris possession du véhicule (location en cours) n'avait jusqu'ici
// aucun moyen de simplement ajouter des jours — seule option : contacter le
// partenaire hors plateforme. extendBooking ne touche jamais la date de début,
// uniquement la date de fin, et reste utilisable jusqu'à la remise du véhicule.
const EXTENDABLE_STATUSES = [
  "pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived",
];

export const extendBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { newEndDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Identifiant de réservation invalide." });
    }

    const booking = await Booking.findById(id).populate("vehicle");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
    if (booking.type !== "location") {
      return res.status(400).json({ message: "Seules les locations peuvent être prolongées." });
    }

    const userId = req.user?.id || req.user?._id;
    const isOwnerById    = booking.client && booking.client.toString() === userId?.toString();
    const isOwnerByEmail = !booking.client && req.user?.emailVerified === true
      && booking.clientInfo?.email?.toLowerCase() === req.user?.email?.toLowerCase();
    if (!isOwnerById && !isOwnerByEmail) {
      return res.status(403).json({ message: "Accès refusé à cette réservation." });
    }

    if (!EXTENDABLE_STATUSES.includes(booking.status)) {
      return res.status(409).json({ message: `Impossible de prolonger une réservation avec le statut "${booking.status}".` });
    }

    const currentEnd = new Date(booking.location.endDate);
    const newEnd = new Date(newEndDate);
    if (isNaN(newEnd.getTime()) || newEnd <= currentEnd) {
      return res.status(400).json({ message: "La nouvelle date de fin doit être postérieure à la date de fin actuelle." });
    }

    const totalDays = Math.max(1, Math.round((newEnd - new Date(booking.location.startDate)) / 86400000));
    const addedDays  = totalDays - (booking.location.days || 0);
    const effectivePricePerDay = applyPromotion(booking.vehicle.pricePerDay || 0, totalDays, booking.vehicle.promotions);
    const newMontantBase = effectivePricePerDay * totalDays;
    const priceDelta = newMontantBase - (booking.montantBase || 0);
    const newMontantTotal = newMontantBase + (booking.montantOptions || 0) + (booking.location.deliveryFee || 0);
    const newCommissionAmount = Math.round(newMontantTotal * (booking.commissionRate || 0) * 100) / 100;

    // Contrôle de chevauchement + écriture dans une transaction — même
    // correctif que modifyBookingDates ci-dessus (bug réel corrigé en audit) :
    // un autre client pourrait déjà avoir réservé ce véhicule juste après la
    // fin initiale prévue, la prolongation ne doit jamais l'écraser, y compris
    // sous requêtes concurrentes.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const conflict = await Booking.findOne({
          _id:     { $ne: booking._id },
          vehicle: booking.vehicle._id,
          status:  { $in: ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "driver_arrived", "transaction_concluded", "waiting_client_validation"] },
          "location.startDate": { $lt: newEnd },
          "location.endDate":   { $gt: currentEnd },
        }).session(session);
        if (conflict) {
          throw Object.assign(new Error("VEHICLE_CONFLICT"), { conflict });
        }
        booking.location.endDate = newEnd;
        booking.location.days    = totalDays;
        booking.montantBase  = newMontantBase;
        booking.montantTotal = newMontantTotal;
        booking.commissionAmount = newCommissionAmount;
        booking.partnerPayout    = Math.max(newMontantTotal - newCommissionAmount - (booking.serviceFeeFCFA || 0), 0);
        // Un solde déjà réglé en ligne ne couvre pas les jours ajoutés — le
        // supplément reste dû (encaissé au retrait/à la restitution, comme le
        // reste de la plateforme le fait déjà pour les paiements en espèces).
        if (booking.isPaid && priceDelta > 0) booking.isPaid = false;
        await booking.save({ session });
      });
    } catch (txErr) {
      if (txErr.conflict) {
        return res.status(409).json({
          message: "Le véhicule est déjà réservé juste après la fin actuelle de votre location — prolongation impossible sur cette période.",
          conflict: { startDate: txErr.conflict.location.startDate, endDate: txErr.conflict.location.endDate },
        });
      }
      throw txErr;
    } finally {
      await session.endSession();
    }

    emitBookingUpdate(booking);
    await syncVehicleAvailability(booking.vehicle._id);

    const ownerId = booking.vehicle.owner;
    if (ownerId) {
      await notify(ownerId, "system", "📅 Location prolongée",
        `Le client a prolongé la réservation ${booking.reference || ""} de ${addedDays} jour(s), nouvelle fin le ${newEnd.toLocaleDateString("fr-FR")}.`,
        "/vendor/dashboard");
    }

    res.json({ booking, addedDays, priceDelta });
  } catch (err) {
    logger.error("extendBooking:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ANNULATION CLIENT — PATCH /:id/cancel
// ═══════════════════════════════════════════════════════════════════════════════
export const cancelBookingByClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasonCode, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Identifiant de réservation invalide." });
    }
    // Motif catégorisé obligatoire (le texte libre reste facultatif) — voir
    // constants/bookingCancelReasons.js. Avant ce correctif, "reason" était un
    // texte libre optionnel : aucune trace exploitable des motifs d'annulation.
    if (!CLIENT_CANCEL_REASON_CODES.includes(reasonCode)) {
      return res.status(400).json({
        message: "Veuillez sélectionner un motif d'annulation.",
        allowedReasonCodes: CLIENT_CANCEL_REASON_CODES,
      });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "title owner")
      .populate("driver",  "firstName lastName owner");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });

    // Vérifie que c'est bien le client de cette réservation
    // Fallback email si booking.client est null (réservation invité, sans compte) —
    // n'accorde la propriété que si l'email du compte authentifié est VÉRIFIÉ,
    // sinon n'importe qui pourrait créer un compte avec l'email d'un client
    // invité (jamais confirmé) et s'approprier sa réservation. Faille réelle
    // trouvée en audit de sécurité (2026-07).
    const userId = req.user?.id || req.user?._id;
    const isOwnerById    = booking.client && booking.client.toString() === userId?.toString();
    const isOwnerByEmail = !booking.client && req.user?.emailVerified === true
      && booking.clientInfo?.email?.toLowerCase() === req.user?.email?.toLowerCase();
    if (!isOwnerById && !isOwnerByEmail) {
      return res.status(403).json({ message: "Accès refusé à cette réservation." });
    }

    // On ne peut annuler que les réservations non-commencées
    const cancellableStatuses = ["pending", "À confirmer", "confirmed"];
    if (!cancellableStatuses.includes(booking.status)) {
      return res.status(409).json({
        message: `Impossible d'annuler une réservation avec le statut "${booking.status}".`,
      });
    }

    const wasPaid = booking.isPaid;

    // Transition atomique — le statut source fait partie du filtre de l'update
    // lui-même (bug réel corrigé en audit) : sans ça, un client qui annule au
    // moment exact où le partenaire confirme/modifie la même réservation
    // (deux lectures passant chacune leur contrôle de statut avant qu'aucune
    // n'ait écrit) pouvait produire un état final incohérent avec ce qui a
    // été notifié à l'une des deux parties.
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: { $in: cancellableStatuses } },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReasonCode: reasonCode,
          cancelReason: reason ? String(reason).trim().slice(0, 500) : null,
          cancelledBy: "client",
        },
      },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ message: "Cette réservation a déjà changé de statut entre-temps." });
    }
    booking.status = updated.status;
    booking.cancelledAt = updated.cancelledAt;

    emitBookingUpdate(booking); // ← temps réel partenaire
    await syncVehicleAvailability(booking.vehicle?._id || booking.vehicle);

    const reasonLabel = CLIENT_CANCEL_REASONS_MAP[reasonCode] || reasonCode;

    // Notifier le partenaire (propriétaire véhicule OU chauffeur selon le type de commande)
    const cancelOwnerId = booking.vehicle?.owner || booking.driver?.owner;
    if (cancelOwnerId) {
      await notify(
        cancelOwnerId,
        "warning",
        "Réservation annulée",
        `Le client a annulé la réservation ${booking.reference || id}. Motif : ${reasonLabel}${reason ? ` — ${reason}` : ""}`,
        "/vendor/dashboard"
      );
    }

    // Un paiement en ligne déjà réglé avant annulation nécessite un remboursement
    // manuel (aucune automatisation de remboursement — hors périmètre de cette
    // fonctionnalité) : signalé aux admins connectés en temps réel, même canal
    // que emitBookingUpdate ci-dessus.
    if (wasPaid && global._io) {
      global._io.to("admins").emit("refund_needed", {
        bookingId: booking._id.toString(), reference: booking.reference,
        reason: "Réservation payée annulée par le client — remboursement à traiter manuellement.",
      });
    }

    res.json({ success: true, message: "Réservation annulée.", status: "cancelled" });
  } catch (err) {
    logger.error("cancelBookingByClient:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION CHAUFFEUR — confirmation d'arrivée + fin de mission par le CLIENT
// ═══════════════════════════════════════════════════════════════════════════════
// Contrairement au reste du pipeline (préparation/en route/etc., piloté par le
// partenaire via updateBookingStatus), ces deux étapes sont déclenchées par le
// CLIENT ("l'employeur") lui-même : c'est lui qui constate que le chauffeur est
// arrivé, puis lui qui clôt la mission — d'où deux routes dédiées plutôt qu'un
// réemploi de la machine à états générique (VALID_TRANSITIONS), qui ne connaît
// que des transitions pilotées par le partenaire ou le client-via-validation de
// transaction (waiting_client_validation). Réservé au type "chauffeur" : sans
// objet pour une location/vente/essai.

const requireClientOwnership = (booking, req) => {
  const userId = req.user?.id || req.user?._id;
  const isOwnerById    = booking.client && booking.client.toString() === userId?.toString();
  const isOwnerByEmail = !booking.client && booking.clientInfo?.email?.toLowerCase() === req.user?.email?.toLowerCase();
  return isOwnerById || isOwnerByEmail;
};

// ── Le client confirme que le chauffeur est arrivé (démarrage de la mission) ──
export const markDriverArrived = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Identifiant de réservation invalide." });
    }

    const booking = await Booking.findById(id).populate("driver", "firstName lastName owner");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
    if (booking.type !== "chauffeur") {
      return res.status(400).json({ message: "Réservé aux missions chauffeur." });
    }
    if (!requireClientOwnership(booking, req)) {
      return res.status(403).json({ message: "Accès refusé à cette réservation." });
    }
    if (!["confirmed", "preparing", "in_progress"].includes(booking.status)) {
      return res.status(409).json({ message: `Impossible de confirmer l'arrivée du chauffeur depuis le statut "${booking.status}".` });
    }

    booking.status = "driver_arrived";
    await booking.save();
    emitBookingUpdate(booking);

    const driverOwnerId = booking.driver?.owner;
    if (driverOwnerId) {
      await notify(driverOwnerId, "system", "📍 Arrivée confirmée",
        `Le client a confirmé votre arrivée pour la mission ${booking.reference || ""}.`, "/vendor/dashboard");
    }

    res.json({ booking, message: "Arrivée du chauffeur confirmée." });
  } catch (err) {
    logger.error("markDriverArrived:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Le client clôt la mission une fois terminée ────────────────────────────────
export const completeMission = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Identifiant de réservation invalide." });
    }

    const booking = await Booking.findById(id).populate("driver", "firstName lastName owner");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
    if (booking.type !== "chauffeur") {
      return res.status(400).json({ message: "Réservé aux missions chauffeur." });
    }
    if (!requireClientOwnership(booking, req)) {
      return res.status(403).json({ message: "Accès refusé à cette réservation." });
    }
    if (booking.status !== "driver_arrived") {
      return res.status(409).json({ message: "Confirmez d'abord l'arrivée du chauffeur avant de terminer la mission." });
    }

    booking.status = "completed";
    booking.isPaid = true;
    booking.paidAt = booking.paidAt || new Date();
    await booking.save();
    emitBookingUpdate(booking);

    // Compteur affiché au partenaire (carte "Mes chauffeurs") — resté à 0 en
    // permanence jusqu'ici, jamais incrémenté nulle part (bug réel trouvé en audit).
    if (booking.driver?._id) {
      await Driver.updateOne({ _id: booking.driver._id }, { $inc: { missionsTotal: 1 } });
    }

    const driverOwnerId = booking.driver?.owner;
    if (driverOwnerId) {
      await notify(driverOwnerId, "driver_completed", "🏁 Mission terminée",
        `Le client a marqué la mission ${booking.reference || ""} comme terminée.`, "/vendor/dashboard");
    }
    schedulePostServiceSurvey(booking);
    issueServiceInvoice(booking);
    await recordPartnerPayout(booking);

    res.json({ booking, message: "Mission terminée." });
  } catch (err) {
    logger.error("completeMission:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WORKFLOW PARTENAIRE : TRAITER LA CAUTION AU RETOUR (PATCH /:id/caution)
// ═══════════════════════════════════════════════════════════════════════════════
// Réservé aux locations, une fois la commande terminée (le véhicule a été
// restitué à ce stade dans le flux existant — voir validateTransaction/
// adminForceComplete). Une seule décision par réservation : pas de correction
// après coup pour éviter toute contestation sur un montant déjà notifié au client.
export const claimCaution = async (req, res) => {
  try {
    const { id } = req.params;
    const { amountClaimed, reason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Identifiant de réservation invalide." });
    }

    const booking = await Booking.findById(id).populate("vehicle", "owner title");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
    if (booking.type !== "location") {
      return res.status(400).json({ message: "La caution ne s'applique qu'aux locations." });
    }

    const ownerId = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
    if (req.user.role !== "admin" && ownerId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    // "cancelled" n'est éligible QUE s'il provient d'une résolution de litige
    // (booking.disputeResolution posé par resolveDispute) : la caution a pu
    // être physiquement encaissée par le partenaire AVANT le litige (prise en
    // charge du véhicule), et sa restitution devait pouvoir être tracée même
    // après une annulation décidée par l'admin (bug réel trouvé en audit). Une
    // annulation client classique (cancelBookingByClient) ne passe jamais par
    // "disputed" — pas de véhicule remis, donc jamais de caution à traiter.
    const cancelledFromDispute = booking.status === "cancelled" && !!booking.disputeResolution;
    if (!["completed", "disputed"].includes(booking.status) && !cancelledFromDispute) {
      return res.status(409).json({ message: "La caution ne peut être traitée qu'une fois la location terminée." });
    }
    if (booking.cautionClaim?.claimedAt) {
      return res.status(409).json({ message: "La caution a déjà été traitée pour cette réservation." });
    }

    const caution = Number(booking.cautionAmount) || 0;
    const amount  = Number(amountClaimed) || 0;
    if (amount < 0 || amount > caution) {
      return res.status(400).json({ message: `Montant invalide (caution disponible : ${caution}).` });
    }
    if (amount > 0 && !String(reason || "").trim()) {
      return res.status(400).json({ message: "Un motif est requis pour retenir tout ou partie de la caution." });
    }

    // Écriture atomique — "cautionClaim.claimedAt" absent fait partie du
    // filtre lui-même (bug réel corrigé en audit) : sans ça, un partenaire qui
    // double-soumet (double-clic, requête rejouée) pouvait faire passer deux
    // décisions de caution différentes, la seconde écrasant silencieusement
    // la première déjà notifiée au client.
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, "cautionClaim.claimedAt": null },
      {
        $set: {
          cautionClaim: {
            amountClaimed: amount,
            reason:        amount > 0 ? String(reason).trim() : null,
            claimedAt:     new Date(),
            claimedBy:     req.user._id,
          },
        },
      },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ message: "La caution a déjà été traitée pour cette réservation." });
    }
    booking.cautionClaim = updated.cautionClaim;
    emitBookingUpdate(booking);

    if (booking.client) {
      const devise   = booking.devise || "USD";
      const returned = caution - amount;
      await notify(
        booking.client,
        "system",
        amount > 0 ? "💳 Caution partiellement retenue" : "💳 Caution restituée intégralement",
        amount > 0
          ? `Le partenaire a retenu ${amount} ${devise} sur votre caution pour ${booking.reference} (${reason}). Montant restitué : ${returned} ${devise}.`
          : `Votre caution de ${caution} ${devise} pour ${booking.reference} vous a été intégralement restituée.`,
        "/dashboard"
      );
    }

    res.json({ booking, message: "Caution traitée." });
  } catch (err) {
    logger.error("claimCaution:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN 1 — Résolution de litige (PATCH /:id/resolve-dispute)
// ═══════════════════════════════════════════════════════════════════════════════
export const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, note, refundClient = false } = req.body;
    // resolution: "completed" | "cancelled" | "compensated"

    const allowed = ["completed", "cancelled", "compensated"];
    if (!allowed.includes(resolution)) {
      return res.status(400).json({ message: `resolution doit être parmi : ${allowed.join(", ")}` });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    const booking = await Booking.findById(id)
      .populate("client",  "firstName lastName email")
      .populate("vehicle", "title owner")
      .populate("driver",  "firstName lastName owner");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });
    if (booking.status !== "disputed") {
      return res.status(409).json({ message: "Cette commande n'est pas en litige." });
    }

    booking.status           = resolution === "compensated" ? "completed" : resolution;
    booking.disputeResolution = { resolution, note: note || null, resolvedBy: req.user._id, resolvedAt: new Date(), refundClient };

    if (resolution === "completed" || resolution === "compensated") {
      booking.isPaid = true;
      booking.paidAt = booking.paidAt || new Date();
    }

    await booking.save();
    emitBookingUpdate(booking); // ← temps réel client + partenaire
    if (booking.status === "completed") await markVehicleSoldIfApplicable(booking);

    // Bug réel corrigé (audit) : une résolution "Compensation" promettait un
    // remboursement partiel au client (voir clientMsg ci-dessous) sans que
    // rien ne le signale nulle part — même signal que les autres cas de
    // remboursement manuel de ce fichier (ex: cancelBookingByClient), pour
    // qu'un admin voie qu'un versement reste dû.
    if (refundClient && global._io) {
      global._io.to("admins").emit("refund_needed", {
        bookingId: booking._id.toString(), reference: booking.reference,
        reason: `Litige résolu en "${resolution}" — remboursement/compensation partielle à traiter manuellement.`,
      });
    }

    // Notifier les deux parties
    const clientMsg = {
      completed:    "✅ Le litige sur votre commande a été résolu en votre faveur.",
      cancelled:    "❌ Le litige a été clôturé. La commande est annulée.",
      compensated:  "✅ Le litige a été résolu — une compensation vous sera versée.",
    }[resolution];

    const disputeOwnerId = booking.vehicle?.owner || booking.driver?.owner;
    if (booking.client?._id) await notify(booking.client._id, "system", "Litige résolu", clientMsg, "/dashboard");
    if (disputeOwnerId) await notify(disputeOwnerId, "system", "Litige résolu",
      `Le litige sur la commande ${booking.reference} a été résolu par l'administration.`, "/vendor/dashboard");
    if (booking.status === "completed") { schedulePostServiceSurvey(booking); issueServiceInvoice(booking); await recordPartnerPayout(booking); }

    res.json({ booking, message: "Litige résolu.", resolution });
  } catch (err) {
    logger.error("resolveDispute:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PARTENAIRE — Répondre à un litige (POST /:id/dispute-response)
// ═══════════════════════════════════════════════════════════════════════════════
// Bug réel corrigé (audit) : un partenaire notifié d'un litige (voir
// validateTransaction) n'avait strictement aucun moyen d'apporter des
// éléments avant que l'admin ne tranche (resolveDispute) — simple spectateur
// passif, renvoyé vers "contactez le support" hors plateforme. N'affecte
// jamais le statut ni la résolution elle-même (toujours exclusivement admin,
// voir resolveDispute) — juste de la visibilité pour éclairer sa décision.
export const respondToDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ message: "Réponse requise." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "owner")
      .populate("driver",  "owner");
    if (!booking) return res.status(404).json({ message: "Commande introuvable." });
    if (booking.status !== "disputed") {
      return res.status(409).json({ message: "Cette commande n'est pas en litige." });
    }

    const vehicleOwnerId = booking.vehicle?.owner?.toString();
    const driverOwnerId  = booking.driver?.owner?.toString();
    const userId         = req.user._id.toString();
    const isOwner = (vehicleOwnerId && vehicleOwnerId === userId) || (driverOwnerId && driverOwnerId === userId);
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    booking.partnerDisputeResponse = { message: message.trim().slice(0, 2000), respondedAt: new Date() };
    await booking.save();

    await notifyAdmins(
      "system",
      "💬 Réponse du partenaire au litige",
      `Le partenaire a répondu au litige sur la commande ${booking.reference}.`,
      "/admin"
    ).catch(() => {});

    res.json({ booking, message: "Réponse envoyée à l'administration." });
  } catch (err) {
    logger.error("respondToDispute:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN 2 — Force complétion d'une commande (PATCH /:id/admin-force-complete)
// ═══════════════════════════════════════════════════════════════════════════════
export const adminForceComplete = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, finalAmount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    const booking = await Booking.findById(id)
      .populate("client",  "firstName lastName")
      .populate("vehicle", "owner title")
      .populate("driver",  "firstName lastName owner");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });
    if (["completed", "cancelled"].includes(booking.status)) {
      return res.status(409).json({ message: "Commande déjà terminée ou annulée." });
    }

    // finalAmount est optionnel (défaut = montant déjà estimé), mais s'il est fourni
    // il doit être un nombre fini strictement positif — sinon `Number(finalAmount) || x`
    // laisse passer NaN/valeurs négatives et produirait une commande "completed" avec
    // un montant incohérent.
    let amount = booking.montantTotal || 0;
    if (finalAmount !== undefined && finalAmount !== null && finalAmount !== "") {
      const parsed = Number(finalAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ message: "Montant final invalide — doit être un nombre positif." });
      }
      amount = parsed;
    }
    const commRate = await resolveCommissionRate(booking.type, booking.vehicle?.owner || booking.driver?.owner);

    booking.status           = "completed";
    booking.isPaid           = true;
    booking.paidAt           = new Date();
    booking.montantTotal     = amount;
    booking.commissionRate   = commRate;
    booking.commissionAmount = Math.round(amount * commRate * 100) / 100;
    booking.partnerPayout    = Math.max(amount - booking.commissionAmount - (booking.serviceFeeFCFA ?? 0), 0);

    if (!booking.transaction?.finalAmount) {
      booking.transaction = { finalAmount: amount, paymentMethod: "cash", comment: `Force-complete admin: ${note || ""}`, recordedAt: new Date(), recordedBy: req.user._id };
    }
    if (note) booking.cancelReason = note;

    await booking.save();
    emitBookingUpdate(booking); // ← temps réel client + partenaire
    await markVehicleSoldIfApplicable(booking);
    syncVehicleAvailability(booking.vehicle?._id);

    const forceCompleteOwnerId = booking.vehicle?.owner || booking.driver?.owner;
    if (booking.client?._id) await notify(booking.client._id, "system", "✅ Commande finalisée", `Votre commande ${booking.reference} a été finalisée par l'administration.`, "/dashboard");
    if (forceCompleteOwnerId) await notify(forceCompleteOwnerId, "system", "✅ Commande finalisée", `La commande ${booking.reference} a été finalisée.`, "/vendor/dashboard");
    schedulePostServiceSurvey(booking);
    issueServiceInvoice(booking);
    await recordPartnerPayout(booking);

    res.json({ booking, message: "Commande finalisée avec succès." });
  } catch (err) {
    logger.error("adminForceComplete:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN 3 — Suppression commande (DELETE /:id/admin-delete)
// ═══════════════════════════════════════════════════════════════════════════════
export const adminDeleteBooking = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ message: "Commande introuvable." });

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: "Commande introuvable." });

    // Sécurité : on ne supprime pas des commandes actives avec transaction
    if (["completed", "waiting_client_validation"].includes(booking.status)) {
      return res.status(409).json({ message: "Impossible de supprimer une commande avec transaction en cours." });
    }

    await Booking.findByIdAndDelete(id);
    syncVehicleAvailability(booking.vehicle);

    res.json({ success: true, message: "Commande supprimée." });
  } catch (err) {
    logger.error("adminDeleteBooking:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN 4 — Export commandes (GET /admin/export)
// ═══════════════════════════════════════════════════════════════════════════════
export const exportBookings = async (req, res) => {
  try {
    const { status, type, dateFrom, dateTo, format = "json" } = req.query;
    const filter = {};
    // Le KPI "En cours" de l'admin (AdminPanel.jsx) agrège plusieurs statuts
    // et envoie une liste séparée par des virgules (ex: "confirmed,preparing,...")
    // — sans ce split, un export déclenché depuis ce filtre ne retournait
    // jamais aucune ligne (aucune réservation n'a ce statut composé).
    if (status) filter.status = status.includes(",") ? { $in: status.split(",") } : status;
    if (type)   filter.type   = type;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .populate("client",  "firstName lastName email phone")
      .populate("vehicle", "title marque modele ville")
      .lean();

    if (format === "csv") {
      const rows = [
        "Reference,Type,Statut,Client,Email,Téléphone,Passeport,Véhicule,Montant,Commission,Net Partenaire,Date,Payé",
        ...bookings.map(b => [
          b.reference || b._id,
          b.type,
          b.status,
          `${b.clientInfo?.firstName || ""} ${b.clientInfo?.lastName || ""}`.trim(),
          b.clientInfo?.email || "",
          b.clientInfo?.phone || "",
          b.clientInfo?.passportNumber || "",
          b.vehicle?.title || "",
          b.montantTotal || 0,
          b.commissionAmount || 0,
          b.partnerPayout || 0,
          b.createdAt?.toISOString().slice(0,10) || "",
          b.isPaid ? "Oui" : "Non",
        ].join(","))
      ].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="commandes-${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send("﻿" + rows); // BOM UTF-8 pour Excel
    }

    res.json({ bookings, total: bookings.length, exportedAt: new Date() });
  } catch (err) {
    logger.error("exportBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN 5 — Stats complètes commandes (GET /admin/stats-full)
// ═══════════════════════════════════════════════════════════════════════════════
export const getAdminBookingStats = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month } = req.query;
    const start = month
      ? new Date(year, Number(month) - 1, 1)
      : new Date(year, 0, 1);
    const end = month
      ? new Date(year, Number(month), 1)
      : new Date(Number(year) + 1, 0, 1);

    const [all, byStatus, byType, revenue] = await Promise.all([
      Booking.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Booking.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        // count = toutes réservations créées sur la période (volume, y compris
        // pending/cancelled) ; revenue/commission = "completed" UNIQUEMENT,
        // sinon ces deux chiffres divergeaient de "revenue" ci-dessous (même
        // période, filtré correctement) — bug réel corrigé en audit.
        { $group: {
          _id:        "$type",
          count:      { $sum: 1 },
          revenue:    { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$montantTotal", 0] } },
          commission: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$commissionAmount", 0] } },
        } },
      ]),
      Booking.aggregate([
        { $match: { status: "completed", paidAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: "$montantTotal" }, commission: { $sum: "$commissionAmount" }, payout: { $sum: "$partnerPayout" }, count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap = Object.fromEntries(byStatus.map(s => [s._id, s.count]));
    const typeMap   = Object.fromEntries(byType.map(t => [t._id, { count: t.count, revenue: t.revenue, commission: t.commission }]));
    const rev = revenue[0] || { total: 0, commission: 0, payout: 0, count: 0 };

    res.json({
      period: { year: Number(year), month: month ? Number(month) : null, start, end },
      total: all,
      byStatus: statusMap,
      byType:   typeMap,
      revenue: { total: rev.total, commission: rev.commission, partnerPayout: rev.payout, completedCount: rev.count },
      disputes: statusMap.disputed || 0,
      pending:  statusMap.pending  || 0,
    });
  } catch (err) {
    logger.error("getAdminBookingStats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FINANCEMENT — demandes de leasing/crédit (Booking type="leasing")
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/bookings/admin/financing (admin) ───────────────────────────────
export const getFinancingRequests = async (req, res) => {
  try {
    const { decision } = req.query;
    const filter = { type: "leasing" };
    if (decision) filter["leasing.decision"] = decision;

    const requests = await Booking.find(filter)
      .populate("client",  "firstName lastName email phone")
      .populate("vehicle", "title marque modele priceForSale")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ requests });
  } catch (err) {
    logger.error("getFinancingRequests:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/bookings/:id/financing-decision (admin) ──────────────────────
// Décision manuelle — aucune banque/société de leasing partenaire n'est
// intégrée pour l'instant (voir Vehicle.leasing/Vehicle.credit pour les
// conditions publiées) : c'est l'admin qui statue, en attendant une
// intégration réelle avec un établissement financier.
export const setFinancingDecision = async (req, res) => {
  try {
    const { decision, note } = req.body;
    if (!["en_etude", "accepte", "refuse"].includes(decision)) {
      return res.status(400).json({ message: "Décision invalide." });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Demande introuvable." });
    if (booking.type !== "leasing") {
      return res.status(400).json({ message: "Cette commande n'est pas une demande de financement." });
    }
    // Une fois l'apport initial encaissé, la décision ne doit plus pouvoir être
    // rejouée (ex: "accepté" → "refusé" après paiement, sans aucune procédure
    // de remboursement associée) — même principe que setDecision (service/
    // assurance) ci-dessus.
    if (booking.isPaid) {
      return res.status(409).json({ message: "L'apport initial est déjà réglé — décision de financement non modifiable." });
    }

    booking.leasing.decision     = decision;
    booking.leasing.decisionNote = note || null;
    booking.leasing.decisionAt   = new Date();
    booking.leasing.decisionBy   = req.user._id;
    await booking.save();

    const labels = { accepte: "✅ Financement accepté", refuse: "❌ Financement refusé", en_etude: "🔍 Financement en étude" };
    if (booking.client) {
      await notify(booking.client, "system", labels[decision],
        `Votre demande de financement ${booking.reference} : ${labels[decision].replace(/^[^\s]+\s/, "")}.${note ? ` Note : ${note}` : ""}`,
        "/dashboard");
    }

    res.json({ success: true, booking });
  } catch (err) {
    logger.error("setFinancingDecision:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Amélioration getAllBookings avec filtres avancés
export const getAllBookingsEnhanced = async (req, res) => {
  try {
    const {
      status, type, search,
      dateFrom, dateTo,
      page = 1, limit = 30,
      sortBy = "createdAt", sortDir = "desc",
    } = req.query;

    const filter = {};
    if (status)  filter.status = status;
    if (type)    filter.type   = type;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      const s = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { reference:           { $regex: s, $options: "i" } },
        { "clientInfo.email":  { $regex: s, $options: "i" } },
        { "clientInfo.firstName": { $regex: s, $options: "i" } },
        { "clientInfo.lastName":  { $regex: s, $options: "i" } },
        { "clientInfo.phone":     { $regex: s, $options: "i" } },
      ];
    }

    const sort = { [sortBy]: sortDir === "asc" ? 1 : -1 };
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
    const safePage  = Math.max(Number(page) || 1, 1);
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort(sort)
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .populate("client",  "firstName lastName email phone kycStatus kycScore")
        .populate("vehicle", "title marque modele owner ville")
        .populate("driver",  "firstName lastName owner")
        .lean(),
      Booking.countDocuments(filter),
    ]);

    res.json({ bookings, total, pages: Math.ceil(total / safeLimit), page: safePage });
  } catch (err) {
    logger.error("getAllBookingsEnhanced:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
