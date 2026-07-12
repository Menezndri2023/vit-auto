import logger from "../utils/logger.js";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import Contract from "../models/Contract.js";
import User from "../models/User.js";
import { dispatch } from "../queue/index.js";
import { resolveDeliveryFee, detectCountryFromCoords } from "../services/deliveryFee.js";

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
async function syncVehicleAvailability(vehicleId) {
  if (!vehicleId) return;
  try {
    const activeStatuses = [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "transaction_concluded", "waiting_client_validation",
    ];
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const hasActiveBooking = await Booking.exists({
      vehicle: vehicleId,
      status:  { $in: activeStatuses },
      "location.startDate": { $lt: tomorrow },
      "location.endDate":   { $gt: today },
    });

    await Vehicle.findByIdAndUpdate(vehicleId, { available: !hasActiveBooking });
  } catch { /* non-bloquant */ }
}

// ── Tarifs options (XOF) ───────────────────────────────────────────────────────
const PRIX_OPTIONS = { gps: 10000, babySeat: 7000, insurance: 15000, driver: 50000 };

// ── Taux de commission par type ────────────────────────────────────────────────
const COMMISSION_RATES = {
  location:  0.15,
  essai:     0.03,
  chauffeur: 0.10,
  leasing:   0.05,
};
const getCommissionRate = (type) => COMMISSION_RATES[type] ?? 0.05;

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
    }

    let montantBase = 0;
    let vehicle = null;
    let driver  = null;
    let ownerId = null;

    // ── Véhicule ───────────────────────────────────────────────────────────────
    if (["location", "essai", "leasing"].includes(type)) {
      if (!vehicleId) return res.status(400).json({ message: "vehicleId requis." });
      vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });
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
            status:  { $in: ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "transaction_concluded", "waiting_client_validation"] },
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
        montantBase = (vehicle.pricePerDay || 0) * (location?.days || 1);
      }
      if (type === "leasing") {
        montantBase = leasingData?.apportInitial || 0;
      }
    }

    // ── Chauffeur ──────────────────────────────────────────────────────────────
    if (type === "chauffeur") {
      if (!driverId) return res.status(400).json({ message: "driverId requis." });
      driver = await Driver.findById(driverId);
      if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });
      // `tarif` est le tarif JOURNÉE (voir VendorSubmit.jsx), `tarifHeure` le tarif
      // HORAIRE — utiliser le second pour une facturation à l'heure, sinon on
      // surfacture massivement (ex: tarif journée × nombre d'heures).
      montantBase = (driver.tarifHeure || driver.tarif || 0) * (chauffeur?.heures || 1);
      ownerId = driver.owner;
    }

    // ── Options location ───────────────────────────────────────────────────────
    let montantOptions = 0;
    if (type === "location" && location?.options) {
      for (const [key, active] of Object.entries(location.options)) {
        if (active && PRIX_OPTIONS[key]) {
          montantOptions += PRIX_OPTIONS[key] * (location.days || 1);
        }
      }
    }

    // ── Frais de livraison — recalculé côté serveur, jamais accepté depuis le client ──
    let deliveryFee = 0;
    if (type === "location" && location?.pickupMethod === "livraison") {
      const cLat = location?.pickupPosition?.lat;
      const cLng = location?.pickupPosition?.lng;
      if (cLat != null && cLng != null && vehicle?.coordonnees?.lat != null && vehicle?.coordonnees?.lng != null) {
        const countryCode = detectCountryFromCoords(cLat, cLng);
        const fee = resolveDeliveryFee({
          clientLat: cLat, clientLng: cLng,
          vehicleLat: vehicle.coordonnees.lat, vehicleLng: vehicle.coordonnees.lng,
          countryCode,
        });
        if (fee?.fee != null) deliveryFee = fee.fee;
      }
    }

    const montantTotal    = montantBase + montantOptions + deliveryFee;
    const commissionRate  = getCommissionRate(type);
    const commissionAmount = Math.round(montantTotal * commissionRate);
    const serviceFeeFCFA  = 1000;
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
      essai:    type === "essai"    ? essai    : undefined,
      chauffeur: type === "chauffeur" ? chauffeur : undefined,
      leasing:  type === "leasing"  ? leasingData : undefined,
      montantBase,
      montantOptions,
      montantTotal,
      devise: "XOF",
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
    const activeStatuses = ["pending", "confirmed", "preparing", "ready", "in_progress", "client_arrived", "transaction_concluded", "waiting_client_validation"];
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
    dispatch.bookingCreated(
      { _id: booking._id, reference, type, montantTotal, location, status: booking.status },
      req.user ? { _id: req.user._id, email: req.user.email, phone: req.user.phone, firstName: req.user.firstName } : null,
      vehicle ? { _id: vehicle._id, title: vehicle.title, owner: { _id: ownerId } } : null
    ).catch((e) => logger.error("dispatch.bookingCreated:", { error: e.message }));

    // Notification temps réel Socket.io immédiate (partenaire propriétaire)
    if (ownerId) {
      notify(ownerId, "new_booking", "📋 Nouvelle commande reçue",
        `${clientInfo.firstName} ${clientInfo.lastName} — Réservation ${reference}`, "/vendor/dashboard"
      ).catch(() => {});
    }

    res.status(201).json({ booking });
  } catch (err) {
    logger.error("createBooking:", err);
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
        .populate("vehicle", "title marque modele images pricePerDay ville contactTel contactNom owner")
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
    const { page = 1, limit = 30 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
    const safePage  = Math.max(Number(page) || 1, 1);

    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find({ owner: req.user._id }).select("_id"),
      Driver.find({ owner: req.user._id }).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);
    const filter = { $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }] };

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .populate("vehicle", "title marque modele owner images pricePerDay contactNom contactTel")
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

    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
    const ALLOWED_SORT = ["createdAt", "updatedAt", "montantTotal", "status", "reference"];
    const safeSortBy  = ALLOWED_SORT.includes(sortBy) ? sortBy : "createdAt";
    const safeSortDir = sortDir === "asc" ? 1 : -1;

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
    const { status, cancelReason } = req.body;

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
    const allowed = VALID_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(status)) {
      return res.status(409).json({
        message: `Transition invalide : ${booking.status} → ${status}.`,
        allowedTransitions: allowed,
      });
    }

    booking.status = status;
    if (status === "cancelled") {
      booking.cancelledAt  = new Date();
      booking.cancelReason = cancelReason || null;
    }
    await booking.save();

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
            cautionXOF:       200000,
            serviceFeeXOF:    booking.serviceFeeFCFA ?? 1000,
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
      cancelled:                  { type: "booking_cancelled", titre: "❌ Réservation annulée",       msg: `Votre réservation ${ref} a été annulée.${cancelReason ? ` Raison : ${cancelReason}` : ""}` },
      disputed:                   { type: "system",            titre: "⚠️ Litige signalé",            msg: `Un litige a été ouvert sur la commande ${ref}.`, lien: "/dashboard" },
    };
    const n = notifs[status];
    if (n && booking.client) {
      await notify(booking.client, n.type, n.titre, n.msg, n.lien || "/dashboard");
    }

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
    const { finalAmount, paymentMethod, comment } = req.body;

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

    // Recalcul commission sur montant final réel
    const commissionRate   = getCommissionRate(booking.type);
    const commissionAmount = Math.round(finalAmount * commissionRate);
    const partnerPayout    = Math.max(finalAmount - commissionAmount - (booking.serviceFeeFCFA || 1000), 0);

    booking.transaction = {
      finalAmount,
      paymentMethod,
      comment:     comment || null,
      recordedAt:  new Date(),
      recordedBy:  req.user._id,
    };
    booking.commissionAmount = commissionAmount;
    booking.partnerPayout    = partnerPayout;
    booking.montantTotal     = finalAmount;
    booking.status           = "waiting_client_validation";

    // Si paiement en espèces, créer l'enregistrement Payment
    if (paymentMethod === "cash") {
      const payment = await Payment.create({
        booking: booking._id,
        amount:  finalAmount,
        devise:  booking.devise || "XOF",
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
        `Le partenaire a enregistré votre transaction de ${Number(finalAmount).toLocaleString("fr-FR")} XOF. Veuillez valider dans votre tableau de bord.`,
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
        `Le client a validé la transaction ${booking.reference}. Commission VIT-AUTO : ${Number(booking.commissionAmount).toLocaleString("fr-FR")} XOF.`,
        "/vendor/dashboard"
      );
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
    }

    await booking.save();

    // ── Socket.io : notifier le partenaire en temps réel ──────────────────
    emitBookingUpdate(booking);

    // Sync disponibilité (quand terminée ou litige → véhicule peut redevenir dispo)
    if (action === "validate") {
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
      "client_arrived", "transaction_concluded", "waiting_client_validation",
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
// 8. STATISTIQUES PARTENAIRE (pour dashboard)
// ═══════════════════════════════════════════════════════════════════════════════
export const getPartnerStats = async (req, res) => {
  try {
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find({ owner: req.user._id }).select("_id"),
      Driver.find({ owner: req.user._id }).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);

    // Filtre optionnel par mois/année pour les rapports mensuels
    const { year, month } = req.query;
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
    if (!paymentMethod || !allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({ message: `Mode de paiement invalide. Acceptés : ${allowedMethods.join(", ")}` });
    }

    const commissionRate   = getCommissionRate(booking.type);
    const commissionAmount = Math.round(finalAmount * commissionRate);
    const partnerPayout    = Math.max(finalAmount - commissionAmount - (booking.serviceFeeFCFA || 1000), 0);

    booking.status = "waiting_client_validation";
    booking.transaction = {
      finalAmount,
      paymentMethod,
      comment:    comment || null,
      recordedAt: new Date(),
      recordedBy: req.user._id,
    };
    booking.commissionAmount = commissionAmount;
    booking.partnerPayout    = partnerPayout;
    booking.montantTotal     = finalAmount;

    if (paymentMethod === "cash") {
      const payment = await Payment.create({
        booking: booking._id,
        amount:  finalAmount,
        devise:  booking.devise || "XOF",
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
        `Le partenaire a enregistré votre transaction de ${Number(finalAmount).toLocaleString("fr-FR")} XOF (${paymentMethod}). Confirmez dans votre tableau de bord.`,
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
// 9. ANNULATION CLIENT — PATCH /:id/cancel
// ═══════════════════════════════════════════════════════════════════════════════
export const cancelBookingByClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "Annulé par le client" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Identifiant de réservation invalide." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "title owner")
      .populate("driver",  "firstName lastName owner");
    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });

    // Vérifie que c'est bien le client de cette réservation
    // Fallback email si booking.client est null (anciennes réservations)
    const userId = req.user?.id || req.user?._id;
    const isOwnerById    = booking.client && booking.client.toString() === userId?.toString();
    const isOwnerByEmail = !booking.client && booking.clientInfo?.email?.toLowerCase() === req.user?.email?.toLowerCase();
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

    booking.status = "cancelled";
    booking.cancelReason = reason;
    await booking.save();

    emitBookingUpdate(booking); // ← temps réel partenaire
    await syncVehicleAvailability(booking.vehicle?._id || booking.vehicle);

    // Notifier le partenaire (propriétaire véhicule OU chauffeur selon le type de commande)
    const cancelOwnerId = booking.vehicle?.owner || booking.driver?.owner;
    if (cancelOwnerId) {
      await notify(
        cancelOwnerId,
        "warning",
        "Réservation annulée",
        `Le client a annulé la réservation ${booking.reference || id}. Raison : ${reason}`,
        "/vendor/dashboard"
      );
    }

    res.json({ success: true, message: "Réservation annulée.", status: "cancelled" });
  } catch (err) {
    logger.error("cancelBookingByClient:", err);
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

    res.json({ booking, message: "Litige résolu.", resolution });
  } catch (err) {
    logger.error("resolveDispute:", err);
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
    const commRate = getCommissionRate(booking.type);

    booking.status           = "completed";
    booking.isPaid           = true;
    booking.paidAt           = new Date();
    booking.montantTotal     = amount;
    booking.commissionAmount = Math.round(amount * commRate);
    booking.partnerPayout    = Math.max(amount - booking.commissionAmount - (booking.serviceFeeFCFA || 1000), 0);

    if (!booking.transaction?.finalAmount) {
      booking.transaction = { finalAmount: amount, paymentMethod: "cash", comment: `Force-complete admin: ${note || ""}`, recordedAt: new Date(), recordedBy: req.user._id };
    }
    if (note) booking.cancelReason = note;

    await booking.save();
    emitBookingUpdate(booking); // ← temps réel client + partenaire
    syncVehicleAvailability(booking.vehicle?._id);

    const forceCompleteOwnerId = booking.vehicle?.owner || booking.driver?.owner;
    if (booking.client?._id) await notify(booking.client._id, "system", "✅ Commande finalisée", `Votre commande ${booking.reference} a été finalisée par l'administration.`, "/dashboard");
    if (forceCompleteOwnerId) await notify(forceCompleteOwnerId, "system", "✅ Commande finalisée", `La commande ${booking.reference} a été finalisée.`, "/vendor/dashboard");

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
    if (status) filter.status = status;
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
        "Reference,Type,Statut,Client,Email,Téléphone,Véhicule,Montant,Commission,Net Partenaire,Date,Payé",
        ...bookings.map(b => [
          b.reference || b._id,
          b.type,
          b.status,
          `${b.clientInfo?.firstName || ""} ${b.clientInfo?.lastName || ""}`.trim(),
          b.clientInfo?.email || "",
          b.clientInfo?.phone || "",
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
        { $group: { _id: "$type", count: { $sum: 1 }, revenue: { $sum: "$montantTotal" }, commission: { $sum: "$commissionAmount" } } },
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
