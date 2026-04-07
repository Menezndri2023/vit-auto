import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";

// Prix des options en FCFA
const PRIX_OPTIONS = { gps: 10000, babySeat: 7000, insurance: 15000, driver: 50000 };

// ── Créer une commande (location / essai / chauffeur) ──────────────────────
export const createBooking = async (req, res) => {
  try {
    const { type, clientInfo, vehicleId, driverId, location, essai, chauffeur, payment: paymentData } = req.body;

    if (!type || !clientInfo?.firstName || !clientInfo?.email) {
      return res.status(400).json({ message: "Type et informations client requis." });
    }

    let montantBase = 0;
    let vehicle = null;
    let driver = null;

    if (type === "location" || type === "essai") {
      if (!vehicleId) return res.status(400).json({ message: "vehicleId requis." });
      vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable." });
      if (!vehicle.available && type === "location") {
        return res.status(409).json({ message: "Véhicule non disponible." });
      }
      if (type === "location") {
        montantBase = (vehicle.pricePerDay || 0) * (location?.days || 1);
      }
    }

    if (type === "chauffeur") {
      if (!driverId) return res.status(400).json({ message: "driverId requis." });
      driver = await Driver.findById(driverId);
      if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });
      montantBase = (driver.tarif || 0) * (chauffeur?.heures || 1);
    }

    // Calcul options location
    let montantOptions = 0;
    if (type === "location" && location?.options) {
      for (const [key, active] of Object.entries(location.options)) {
        if (active && PRIX_OPTIONS[key]) {
          montantOptions += PRIX_OPTIONS[key] * (location.days || 1);
        }
      }
    }

    const montantTotal = montantBase + montantOptions;

    const booking = await Booking.create({
      type,
      clientInfo,
      client: req.user?._id || null,
      vehicle: vehicle?._id || null,
      driver: driver?._id || null,
      location: type === "location" ? location : undefined,
      essai: type === "essai" ? essai : undefined,
      chauffeur: type === "chauffeur" ? chauffeur : undefined,
      montantBase,
      montantOptions,
      montantTotal,
    });

    // Enregistrer le paiement si présent
    if (paymentData?.method) {
      const paiement = await Payment.create({
        booking: booking._id,
        amount: montantTotal,
        method: paymentData.method,
        status: "completed",
        paymentDetails: {
          cardLast4:    paymentData.cardNumber?.slice(-4) || null,
          cardHolder:   paymentData.cardHolder || null,
          mobileNumber: paymentData.mobileNumber || null,
          provider:     paymentData.method,
        },
      });
      booking.payment = paiement._id;
      booking.isPaid = true;
      booking.paidAt = new Date();
      booking.status = "confirmed";
      await booking.save();
    }

    // Notification client
    if (req.user?._id) {
      const labels = { location: "Location", essai: "Essai", chauffeur: "Chauffeur" };
      await Notification.create({
        user: req.user._id,
        type: "booking_confirmed",
        titre: `${labels[type]} confirmé`,
        message: "Votre commande a bien été enregistrée.",
        lien: "/dashboard",
      });
    }

    // Notification partenaire
    const ownerId = vehicle?.owner || driver?.owner;
    if (ownerId) {
      await Notification.create({
        user: ownerId,
        type: "new_booking",
        titre: "Nouvelle commande reçue",
        message: `${clientInfo.firstName} ${clientInfo.lastName} a effectué une réservation.`,
        lien: "/vendor/dashboard",
      });
    }

    res.status(201).json({ booking });
  } catch (err) {
    console.error("createBooking:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mes commandes (client connecté) ───────────────────────────────────────
export const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ client: req.user._id })
      .sort({ createdAt: -1 })
      .populate("vehicle", "title marque modele images pricePerDay ville")
      .populate("driver", "firstName lastName profilePhoto tarif zone")
      .populate("payment", "method status amount devise");
    res.json({ bookings });
  } catch (err) {
    console.error("getMyBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Commandes reçues (partenaire) ─────────────────────────────────────────
export const getPartnerBookings = async (req, res) => {
  try {
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find({ owner: req.user._id }).select("_id"),
      Driver.find({ owner: req.user._id }).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);

    const bookings = await Booking.find({
      $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }],
    })
      .sort({ createdAt: -1 })
      .populate("vehicle", "title marque modele")
      .populate("driver", "firstName lastName")
      .populate("payment", "method status amount");

    res.json({ bookings });
  } catch (err) {
    console.error("getPartnerBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Toutes les commandes (admin) ──────────────────────────────────────────
export const getAllBookings = async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type)   filter.type   = type;

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate("client", "firstName lastName email phone")
        .populate("vehicle", "title marque modele")
        .populate("driver", "firstName lastName"),
      Booking.countDocuments(filter),
    ]);

    res.json({ bookings, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("getAllBookings:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Mettre à jour le statut (partenaire ou admin) ─────────────────────────
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancelReason } = req.body;

    const validStatuses = ["pending", "confirmed", "in_progress", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const booking = await Booking.findById(id)
      .populate("vehicle", "owner")
      .populate("driver", "owner");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });

    const isOwner =
      booking.vehicle?.owner?.toString() === req.user._id.toString() ||
      booking.driver?.owner?.toString()  === req.user._id.toString();

    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    booking.status = status;
    if (status === "cancelled") {
      booking.cancelledAt  = new Date();
      booking.cancelReason = cancelReason || null;
    }
    await booking.save();

    // Notifier le client
    if (booking.client) {
      const notifs = {
        confirmed:   { type: "booking_confirmed",  titre: "Réservation confirmée",  msg: "Votre réservation a été confirmée par le partenaire." },
        cancelled:   { type: "booking_cancelled",  titre: "Réservation annulée",    msg: `Votre réservation a été annulée. ${cancelReason || ""}` },
        completed:   { type: "booking_completed",  titre: "Commande terminée",      msg: "Merci ! Laissez un avis sur votre expérience." },
        in_progress: { type: "booking_confirmed",  titre: "En cours",               msg: "Votre réservation est maintenant en cours." },
      };
      const n = notifs[status];
      if (n) {
        await Notification.create({ user: booking.client, type: n.type, titre: n.titre, message: n.msg, lien: "/dashboard" });
      }
    }

    res.json({ booking });
  } catch (err) {
    console.error("updateBookingStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
