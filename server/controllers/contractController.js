import logger from "../utils/logger.js";
import mongoose from "mongoose";
import Contract from "../models/Contract.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";

// ── Créer un contrat depuis une réservation ───────────────────────────────
export const createContract = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "bookingId invalide." });
    }

    const booking = await Booking.findById(bookingId)
      .populate("vehicle", "title marque modele annee couleur kilometrage contactNom contactTel owner")
      .populate("client", "firstName lastName email phone");

    if (!booking) return res.status(404).json({ message: "Réservation introuvable." });

    // Vérifier ownership (partenaire ou admin)
    const vehicleOwner = booking.vehicle?.owner?.toString();
    const isOwner = vehicleOwner === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    // Contrat déjà créé ?
    const existing = await Contract.findOne({ booking: bookingId });
    if (existing) return res.json({ contract: existing });

    const veh = booking.vehicle;
    const ci  = booking.clientInfo;

    const contract = await Contract.create({
      booking:  booking._id,
      type:     booking.type,
      client: {
        firstName: ci?.firstName,
        lastName:  ci?.lastName,
        email:     ci?.email,
        phone:     ci?.phone,
        idType:    booking.clientVerification?.idType,
        idNumber:  booking.clientVerification?.idNumber,
      },
      vendor: {
        name:  veh?.contactNom || req.user.firstName,
        email: req.user.email,
        phone: veh?.contactTel || req.user.phone,
      },
      vehicle: {
        name:  veh ? [veh.title, veh.marque, veh.modele].filter(Boolean).join(" ") : "",
        brand: veh?.marque,
        year:  veh?.annee,
        color: veh?.couleur,
        mileage: veh?.kilometrage,
      },
      terms: {
        startDate:      booking.location?.startDate,
        endDate:        booking.location?.endDate,
        days:           booking.location?.days,
        pickupLocation: booking.location?.pickupLocation,
        returnLocation: booking.location?.returnLocation,
        dailyRateXOF:   veh?.pricePerDay,
        cautionXOF:     booking.location?.caution || 200000,
        serviceFeeXOF:  booking.serviceFeeFCFA ?? 1000,
        optionsXOF:     booking.montantOptions ?? 0,
        baseXOF:        booking.montantBase,
        totalXOF:       booking.montantTotal,
        commissionRate: booking.commissionRate,
        commissionXOF:  booking.commissionAmount,
        partnerPayoutXOF: booking.partnerPayout,
        // Leasing
        apportInitial: booking.leasing?.apportInitial ?? 0,
        mensualite:    booking.leasing?.mensualite ?? 0,
        dureeLeasing:  booking.leasing?.duree ?? 0,
        tauxInteret:   booking.leasing?.tauxInteret ?? 0,
        totalLeasing:  booking.leasing?.totalLeasing ?? 0,
      },
      status: "sent",
    });

    // Lier le contrat à la réservation
    await Booking.findByIdAndUpdate(bookingId, { contract: contract._id });

    res.status(201).json({ contract });
  } catch (err) {
    logger.error("createContract:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Récupérer un contrat (par bookingId ou contractId) ───────────────────
export const getContract = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Contrat introuvable." });
    }

    // Chercher par contrat ID ou booking ID
    let contract = await Contract.findById(id).populate("booking");
    if (!contract) {
      contract = await Contract.findOne({ booking: id }).populate("booking");
    }
    if (!contract) return res.status(404).json({ message: "Contrat introuvable." });

    res.json({ contract });
  } catch (err) {
    logger.error("getContract:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Signer le contrat (client) ────────────────────────────────────────────
export const signContract = async (req, res) => {
  try {
    const { id } = req.params;
    const { signature, clientEmail } = req.body; // base64 canvas image

    if (!signature) return res.status(400).json({ message: "Signature requise." });
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Contrat introuvable." });
    }

    const contract = await Contract.findById(id).populate({
      path: "booking",
      select: "client clientInfo",
    });
    if (!contract) return res.status(404).json({ message: "Contrat introuvable." });
    if (contract.isSigned) return res.status(409).json({ message: "Contrat déjà signé." });

    // Vérification sécurité : seul le client concerné peut signer
    const booking = contract.booking;
    if (booking) {
      const bookingClientId    = booking.client?.toString();
      const bookingClientEmail = booking.clientInfo?.email?.toLowerCase();
      const requestUserId      = req.user?._id?.toString();
      const requestEmail       = (clientEmail || "").toLowerCase();

      const isAuthorizedById    = requestUserId && bookingClientId && requestUserId === bookingClientId;
      const isAuthorizedByEmail = requestEmail && bookingClientEmail && requestEmail === bookingClientEmail;

      if (!isAuthorizedById && !isAuthorizedByEmail) {
        return res.status(403).json({ message: "Vous n'êtes pas autorisé à signer ce contrat." });
      }
    }

    contract.isSigned        = true;
    contract.signedAt        = new Date();
    contract.clientSignature = signature;
    contract.status          = "signed";
    contract.signatureMetadata = {
      ip:        req.ip || req.headers["x-forwarded-for"] || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      timestamp: new Date(),
    };
    await contract.save();

    res.json({ contract });
  } catch (err) {
    logger.error("signContract:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Contrats du partenaire connecté ──────────────────────────────────────
export const getPartnerContracts = async (req, res) => {
  try {
    const [myVehicles, myDrivers] = await Promise.all([
      Vehicle.find({ owner: req.user._id }).select("_id"),
      Driver.find({ owner: req.user._id }).select("_id"),
    ]);
    const vehicleIds = myVehicles.map((v) => v._id);
    const driverIds  = myDrivers.map((d) => d._id);

    const myBookings = await Booking.find({
      $or: [{ vehicle: { $in: vehicleIds } }, { driver: { $in: driverIds } }],
    }).select("_id");

    const bookingIds = myBookings.map((b) => b._id);

    const contracts = await Contract.find({ booking: { $in: bookingIds } })
      .populate("booking", "reference type status montantTotal")
      .sort({ createdAt: -1 });

    res.json({ contracts });
  } catch (err) {
    logger.error("getPartnerContracts:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
