import Contract from "../models/Contract.js";
import Booking from "../models/Booking.js";
import mongoose from "mongoose";

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
    console.error("createContract:", err);
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
    console.error("getContract:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Signer le contrat (client) ────────────────────────────────────────────
export const signContract = async (req, res) => {
  try {
    const { id } = req.params;
    const { signature } = req.body; // base64 canvas image

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
    console.error("signContract:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Contrats du partenaire connecté ──────────────────────────────────────
export const getPartnerContracts = async (req, res) => {
  try {
    const contracts = await Contract.find()
      .populate({
        path: "booking",
        match: {},
        populate: { path: "vehicle", select: "owner title marque modele" },
      })
      .sort({ createdAt: -1 });

    // Filtrer ceux appartenant au partenaire
    const mine = contracts.filter(
      (c) => c.booking?.vehicle?.owner?.toString() === req.user._id.toString()
    );

    res.json({ contracts: mine });
  } catch (err) {
    console.error("getPartnerContracts:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
