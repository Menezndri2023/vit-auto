import logger from "../utils/logger.js";
import IETransaction       from "../models/IETransaction.js";
import ImportExportListing  from "../models/ImportExportListing.js";
import InspectionReport     from "../models/InspectionReport.js";
import User                 from "../models/User.js";
import Notification         from "../models/Notification.js";
import Chat                 from "../models/Chat.js";
import { dispatch } from "../queue/index.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const pushHistory = (tx, status, userId, note = null) => {
  tx.statusHistory.push({ status, changedAt: new Date(), changedBy: userId, note });
};

const notify = async (userId, type, titre, message, lien) => {
  await Notification.create({ user: userId, type, titre, message, lien });
};

const notifyAdmins = async (type, titre, message, lien) => {
  const admins = await User.find({ role: "admin" }).select("_id");
  if (admins.length > 0) {
    await Notification.insertMany(admins.map((a) => ({ user: a._id, type, titre, message, lien })));
  }
};

// ── Valider et parser une date — retourne null si invalide ────────────────
const parseDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

// ── Créer un chat lié à la transaction ────────────────────────────────────
const createTransactionChat = async (clientId, partnerId, txId) => {
  const chat = await Chat.create({
    participants: [clientId, partnerId],
    type: "client_partner",
    lastMessage: "Conversation liée à une transaction import/export",
    lastMessageAt: new Date(),
    messages: [],
  });
  return chat._id;
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 4 — RÉSERVATION GRATUITE
// POST /api/import-export/transactions
// ═══════════════════════════════════════════════════════════════════════════

export const createReservation = async (req, res) => {
  try {
    const { listingId, destCountry, destCity, notes } = req.body;

    if (!listingId) return res.status(400).json({ message: "listingId requis." });

    const listing = await ImportExportListing.findOne({ _id: listingId, status: "approved" });
    if (!listing) return res.status(404).json({ message: "Annonce introuvable ou non disponible." });

    // Éviter que le partenaire réserve sa propre annonce
    if (listing.partner.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Vous ne pouvez pas réserver votre propre annonce." });
    }

    // Vérifier qu'il n'y a pas déjà une réservation active pour ce client
    const existing = await IETransaction.findOne({
      listing: listingId,
      client:  req.user._id,
      status:  { $nin: ["cancelled", "completed"] },
    });
    if (existing) {
      return res.status(409).json({ message: "Vous avez déjà une réservation active sur cette annonce.", txId: existing._id });
    }

    // Créer le chat
    const chatId = await createTransactionChat(req.user._id, listing.partner, null);

    const tx = await IETransaction.create({
      listing: listingId,
      client:  req.user._id,
      partner: listing.partner,
      destCountry: destCountry || null,
      destCity:    destCity    || null,
      notes:       notes       || null,
      status: "reserved",
      chat:   chatId,
      statusHistory: [{
        status: "reserved", changedAt: new Date(), changedBy: req.user._id, note: "Réservation initiale",
      }],
    });

    // Mettre à jour le chat avec l'ID de la transaction (pas possible avant création)
    // On ne stocke pas l'ID de transaction dans le chat pour garder Chat générique

    // Incrémenter inquiries sur l'annonce
    await ImportExportListing.findByIdAndUpdate(listingId, { $inc: { inquiries: 1 } });

    // Notifier le partenaire
    const client = req.user;
    await notify(
      listing.partner,
      "ie_reservation",
      "Nouvelle réservation !",
      `${client.firstName} ${client.lastName} a réservé votre annonce "${listing.title}".`,
      `/importer-dashboard`
    );

    res.status(201).json({
      message: "Réservation effectuée avec succès. Le fournisseur va confirmer la disponibilité sous peu.",
      transaction: tx,
    });
  } catch (err) {
    logger.error("createReservation:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 5 — CONFIRMATION DU FOURNISSEUR
// PATCH /api/import-export/transactions/:id/confirm
// ═══════════════════════════════════════════════════════════════════════════

export const confirmReservation = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      partner: req.user._id,
      status: "reserved",
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou déjà traitée." });

    tx.status = "confirmed";
    pushHistory(tx, "confirmed", req.user._id, "Fournisseur confirme disponibilité, prix et informations.");
    await tx.save();

    await notify(
      tx.client,
      "success",
      "Réservation confirmée !",
      "Le fournisseur a confirmé la disponibilité du véhicule. Vous pouvez maintenant échanger directement.",
      `/import-export/transaction/${tx._id}`
    );

    res.json({ message: "Réservation confirmée.", transaction: tx });
  } catch (err) {
    logger.error("confirmReservation:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 7 — DEMANDE D'INSPECTION INDÉPENDANTE (client)
// PATCH /api/import-export/transactions/:id/request-inspection
// ═══════════════════════════════════════════════════════════════════════════

export const requestIndependentInspection = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      client: req.user._id,
      status: { $in: ["confirmed", "in_discussion"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    tx.independentInspection.requested   = true;
    tx.independentInspection.requestedAt = new Date();
    tx.status = "inspection_requested";
    pushHistory(tx, "inspection_requested", req.user._id, "Client demande une inspection indépendante VIT AUTO.");
    await tx.save();

    // Notifier les admins pour assignation
    await notifyAdmins(
      "ie_inspection",
      "Demande d'inspection indépendante",
      `Transaction ${tx._id} — ${req.user.firstName} ${req.user.lastName} demande une contre-expertise.`,
      `/admin`
    );
    // Notifier le partenaire
    await notify(tx.partner, "info", "Inspection indépendante demandée", "Le client a demandé une inspection indépendante VIT AUTO.", `/importer-dashboard`);

    res.json({ message: "Demande d'inspection envoyée à VIT AUTO.", transaction: tx });
  } catch (err) {
    logger.error("requestIndependentInspection:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/import-export/transactions/:id/complete-inspection  — admin
export const completeIndependentInspection = async (req, res) => {
  try {
    const { reportNotes } = req.body;
    const tx = await IETransaction.findOne({ _id: req.params.id, status: "inspection_requested" });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable." });

    tx.independentInspection.completedAt   = new Date();
    tx.independentInspection.assignedTo    = req.user._id;
    tx.independentInspection.reportNotes   = reportNotes || null;
    tx.status = "inspection_done";
    pushHistory(tx, "inspection_done", req.user._id, "Inspection indépendante complétée.");
    await tx.save();

    await notify(tx.client,  "success", "Rapport d'inspection disponible", "L'inspection indépendante est terminée. Consultez le rapport dans votre espace.", `/import-export/transaction/${tx._id}`);
    await notify(tx.partner, "info",    "Inspection terminée", "L'inspection indépendante du véhicule est terminée.", `/importer-dashboard`);

    res.json({ message: "Inspection complétée.", transaction: tx });
  } catch (err) {
    logger.error("completeIndependentInspection:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 8 — OFFRE FINALE DU FOURNISSEUR
// POST /api/import-export/transactions/:id/final-offer
// ═══════════════════════════════════════════════════════════════════════════

export const sendFinalOffer = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      partner: req.user._id,
      status: { $in: ["confirmed", "in_discussion", "inspection_done"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    const { vehiclePrice, exportFees, shippingCost, insurance, currency, estimatedDelay, notes } = req.body;

    if (!vehiclePrice) return res.status(400).json({ message: "Prix du véhicule requis." });

    const total = Number(vehiclePrice) + Number(exportFees || 0) + Number(shippingCost || 0) + Number(insurance || 0);

    tx.finalOffer = {
      vehiclePrice:   Number(vehiclePrice),
      exportFees:     Number(exportFees || 0),
      shippingCost:   Number(shippingCost || 0),
      insurance:      Number(insurance || 0),
      totalAmount:    total,
      currency:       currency || "EUR",
      estimatedDelay: estimatedDelay || null,
      notes:          notes || null,
      sentAt:         new Date(),
      acceptedAt:     null,
    };
    tx.status = "offer_sent";
    pushHistory(tx, "offer_sent", req.user._id, `Offre finale envoyée : ${total} ${currency || "EUR"}`);
    await tx.save();

    await notify(
      tx.client,
      "ie_offer",
      "Offre finale reçue !",
      `Le fournisseur vous a envoyé une offre finale de ${total.toLocaleString("fr-FR")} ${currency || "EUR"}. Consultez-la pour valider.`,
      `/import-export/transaction/${tx._id}`
    );

    res.json({ message: "Offre finale envoyée.", transaction: tx });
  } catch (err) {
    logger.error("sendFinalOffer:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT ACCEPTE L'OFFRE
// PATCH /api/import-export/transactions/:id/accept-offer
// ═══════════════════════════════════════════════════════════════════════════

export const acceptOffer = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      client: req.user._id,
      status: "offer_sent",
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou offre non disponible." });

    tx.finalOffer.acceptedAt = new Date();
    tx.status = "payment_pending";
    pushHistory(tx, "payment_pending", req.user._id, "Client a accepté l'offre finale. Paiement en attente.");
    await tx.save();

    await notify(tx.partner, "success", "Offre acceptée !", "Le client a accepté votre offre finale. En attente du paiement.", `/importer-dashboard`);

    res.json({ message: "Offre acceptée. Procédez au paiement.", transaction: tx });
  } catch (err) {
    logger.error("acceptOffer:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 9 — PAIEMENT ESCROW
// POST /api/import-export/transactions/:id/pay
// ═══════════════════════════════════════════════════════════════════════════

export const payEscrow = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      client: req.user._id,
      status: "payment_pending",
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou paiement non attendu." });

    const { method, transactionRef } = req.body;

    tx.payment = {
      amount:         tx.finalOffer.totalAmount,
      currency:       tx.finalOffer.currency,
      method:         method || "virement",
      transactionRef: transactionRef || null,
      paidAt:         new Date(),
      escrowRef:      `ESCROW-${tx._id.toString().slice(-8).toUpperCase()}-${Date.now()}`,
      releasedAt:     null,
    };
    tx.status = "in_escrow";
    pushHistory(tx, "in_escrow", req.user._id, `Paiement de ${tx.payment.amount} ${tx.payment.currency} reçu en entiercement.`);
    await tx.save();

    await notify(tx.partner, "success", "Fonds sécurisés en entiercement !", `Le paiement de ${tx.payment.amount?.toLocaleString("fr-FR")} ${tx.payment.currency} est sécurisé. Procédez à la préparation de l'export.`, `/importer-dashboard`);
    await notifyAdmins("ie_payment", "Paiement escrow reçu", `Transaction ${tx._id} — ${tx.payment.amount} ${tx.payment.currency} en entiercement.`, `/admin`);

    res.json({ message: "Paiement sécurisé en entiercement.", escrowRef: tx.payment.escrowRef, transaction: tx });
  } catch (err) {
    logger.error("payEscrow:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 10 — DOCUMENTS D'EXPORT
// PATCH /api/import-export/transactions/:id/documents
// ═══════════════════════════════════════════════════════════════════════════

export const updateDocuments = async (req, res) => {
  try {
    // "in_escrow" (avant le tout premier document renseigné) ET "preparing" (les
    // suivants) doivent être acceptés — sinon seule la toute première mise à jour
    // de document réussit : elle fait déjà basculer le statut vers "preparing",
    // ce qui bloquerait ensuite tous les documents restants avec un 404.
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      partner: req.user._id,
      status: { $in: ["in_escrow", "preparing"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    const { documents } = req.body;
    if (!documents || typeof documents !== "object") {
      return res.status(400).json({ message: "Données documents invalides." });
    }

    const allowed = ["commercialInvoice", "customsDocs", "originCertificate", "billOfLading", "inspectionDocs", "transportBooking"];
    for (const key of allowed) {
      if (documents[key]) {
        tx.documents[key] = { ...tx.documents[key].toObject?.() || {}, ...documents[key] };
      }
    }

    // Passer en "preparing" si ce n'est pas déjà le cas
    if (tx.status === "in_escrow") {
      tx.status = "preparing";
      pushHistory(tx, "preparing", req.user._id, "Préparation des documents d'export démarrée.");
    }

    await tx.save();

    await notify(tx.client, "info", "Documents en préparation", "Le fournisseur prépare les documents d'export. Vous pouvez suivre l'avancement.", `/import-export/transaction/${tx._id}`);

    res.json({ message: "Documents mis à jour.", transaction: tx });
  } catch (err) {
    logger.error("updateDocuments:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 11 — EXPÉDITION
// PATCH /api/import-export/transactions/:id/ship
// ═══════════════════════════════════════════════════════════════════════════

export const markShipped = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      partner: req.user._id,
      status: { $in: ["in_escrow", "preparing"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    const { carrier, trackingNumber, shippingType, departureDate, estimatedArrival, currentStatus } = req.body;

    tx.shipping = {
      carrier:          carrier || null,
      trackingNumber:   trackingNumber || null,
      shippingType:     shippingType   || null,
      departureDate:    parseDate(departureDate),
      estimatedArrival: parseDate(estimatedArrival),
      currentStatus:    currentStatus  || "Départ du port d'origine",
      shippedAt:        new Date(),
    };
    tx.status = "shipped";
    pushHistory(tx, "shipped", req.user._id, `Véhicule expédié. ${carrier ? "Transporteur : " + carrier : ""} ${trackingNumber ? "N° suivi : " + trackingNumber : ""}`);
    await tx.save();

    await notify(tx.client, "success", "Véhicule expédié !", `Votre véhicule est en route ! ${trackingNumber ? "N° de suivi : " + trackingNumber : "Suivez l'acheminement dans votre espace."}`, `/import-export/transaction/${tx._id}`);

    res.json({ message: "Expédition enregistrée.", transaction: tx });
  } catch (err) {
    logger.error("markShipped:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/import-export/transactions/:id/tracking — partenaire met à jour le tracking
export const updateTracking = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      partner: req.user._id,
      status: { $in: ["shipped", "in_transit"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable." });

    const { currentStatus, estimatedArrival } = req.body;
    if (currentStatus) tx.shipping.currentStatus = currentStatus;
    if (estimatedArrival) tx.shipping.estimatedArrival = parseDate(estimatedArrival) || tx.shipping.estimatedArrival;
    tx.status = "in_transit";
    pushHistory(tx, "in_transit", req.user._id, `Mise à jour suivi : ${currentStatus || ""}`);
    await tx.save();

    await notify(tx.client, "info", "Mise à jour transport", `Statut : ${currentStatus || "En transit"}`, `/import-export/transaction/${tx._id}`);

    res.json({ message: "Tracking mis à jour.", transaction: tx });
  } catch (err) {
    logger.error("updateTracking:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 12 — CONFIRMATION DE LIVRAISON (client)
// PATCH /api/import-export/transactions/:id/deliver
// ═══════════════════════════════════════════════════════════════════════════

export const confirmDelivery = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      client: req.user._id,
      status: { $in: ["shipped", "in_transit"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    const { deliveryNotes } = req.body;

    tx.deliveredAt           = new Date();
    tx.deliveryConfirmedAt   = new Date();
    tx.deliveryNotes         = deliveryNotes || null;
    tx.status = "delivered";
    pushHistory(tx, "delivered", req.user._id, deliveryNotes || "Client confirme la réception du véhicule.");
    await tx.save();

    await notify(tx.partner, "success", "Livraison confirmée !", "Le client a confirmé la réception du véhicule. Libération des fonds en cours.", `/importer-dashboard`);
    await notifyAdmins("ie_delivery", "Livraison confirmée", `Transaction ${tx._id} — Libération des fonds à valider.`, `/admin`);

    // Étape 13 : vérification escrow automatique en arrière-plan
    dispatch.ieStepTransition(tx._id.toString(), 13, req.user._id.toString(), "Livraison confirmée par le client")
      .catch(() => {});

    res.json({ message: "Livraison confirmée. Les fonds vont être libérés.", transaction: tx });
  } catch (err) {
    logger.error("confirmDelivery:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 13 — LIBÉRATION DES FONDS (admin ou client)
// PATCH /api/import-export/transactions/:id/release-funds
// ═══════════════════════════════════════════════════════════════════════════

export const releaseFunds = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      status: "delivered",
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    // Seul le client ou un admin peut libérer les fonds
    const isAdmin  = req.user.role === "admin";
    const isClient = tx.client.toString() === req.user._id.toString();
    if (!isAdmin && !isClient) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    tx.payment.releasedAt = new Date();
    tx.status = "funds_released";
    pushHistory(tx, "funds_released", req.user._id, `Fonds libérés vers le fournisseur par ${isAdmin ? "l'admin" : "le client"}.`);
    await tx.save();

    await notify(tx.partner, "success", "Fonds libérés !", `Les fonds de ${tx.payment.amount?.toLocaleString("fr-FR")} ${tx.payment.currency} ont été libérés sur votre compte.`, `/importer-dashboard`);
    await notify(tx.client,  "info",    "Fonds libérés", "Les fonds ont été versés au fournisseur. N'oubliez pas de laisser votre évaluation.", `/import-export/transaction/${tx._id}`);

    // Étape 14 : invitation évaluation planifiée à 24h
    dispatch.ieStepTransition(tx._id.toString(), 14, req.user._id.toString(), "Fonds libérés — transaction finalisée")
      .catch(() => {});

    res.json({ message: "Fonds libérés avec succès.", transaction: tx });
  } catch (err) {
    logger.error("releaseFunds:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 14 — ÉVALUATIONS MUTUELLES
// POST /api/import-export/transactions/:id/review
// ═══════════════════════════════════════════════════════════════════════════

export const addReview = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      status: { $in: ["funds_released", "completed"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou non éligible à l'évaluation." });

    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Note entre 1 et 5 requise." });
    }

    const isClient  = tx.client.toString()  === req.user._id.toString();
    const isPartner = tx.partner.toString() === req.user._id.toString();
    if (!isClient && !isPartner) return res.status(403).json({ message: "Accès refusé." });

    if (isClient) {
      if (tx.clientReview.rating) return res.status(409).json({ message: "Vous avez déjà laissé une évaluation." });
      tx.clientReview = { rating: Number(rating), comment: comment || null, createdAt: new Date() };
      await notify(tx.partner, "success", "Nouvelle évaluation !", `${req.user.firstName} vous a laissé une note de ${rating}/5.`, `/importer-dashboard`);
    } else {
      if (tx.partnerReview.rating) return res.status(409).json({ message: "Vous avez déjà laissé une évaluation." });
      tx.partnerReview = { rating: Number(rating), comment: comment || null, createdAt: new Date() };
      await notify(tx.client, "success", "Nouvelle évaluation !", `Le fournisseur vous a laissé une note de ${rating}/5.`, `/import-export/transaction/${tx._id}`);
    }

    // Si les deux ont évalué → transaction complète
    if (tx.clientReview.rating && tx.partnerReview.rating) {
      tx.status = "completed";
      pushHistory(tx, "completed", req.user._id, "Transaction complète — les deux parties ont évalué.");
      // Décrémenter le stock sans passer sous 0 ; mettre hors stock si nécessaire
      const updatedListing = await ImportExportListing.findByIdAndUpdate(
        tx.listing,
        [{ $set: { stockQty: { $max: [{ $subtract: ["$stockQty", 1] }, 0] } } }],
        { new: true }
      );
      if (updatedListing && updatedListing.stockQty === 0) {
        await ImportExportListing.findByIdAndUpdate(tx.listing, { available: false });
      }
    }

    await tx.save();
    res.json({ message: "Évaluation enregistrée.", transaction: tx });
  } catch (err) {
    logger.error("addReview:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LITIGE
// POST /api/import-export/transactions/:id/dispute
// ═══════════════════════════════════════════════════════════════════════════

export const openDispute = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      status: { $in: ["in_escrow", "preparing", "shipped", "in_transit", "delivered"] },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou litige non autorisé à ce stade." });

    const isParticipant = [tx.client.toString(), tx.partner.toString()].includes(req.user._id.toString());
    if (!isParticipant) return res.status(403).json({ message: "Accès refusé." });

    if (tx.dispute.opened) return res.status(409).json({ message: "Un litige est déjà ouvert." });

    const { reason } = req.body;
    tx.dispute = { opened: true, openedAt: new Date(), openedBy: req.user._id, reason: reason || null };
    tx.status = "disputed";
    pushHistory(tx, "disputed", req.user._id, `Litige ouvert : ${reason || "sans motif précisé"}`);
    await tx.save();

    const otherParty = isParticipant && tx.client.toString() === req.user._id.toString() ? tx.partner : tx.client;
    await notify(otherParty, "error", "Litige ouvert", `Un litige a été ouvert sur la transaction. VIT AUTO va intervenir.`, `/import-export/transaction/${tx._id}`);
    await notifyAdmins("ie_dispute", "⚠️ Litige ouvert", `Transaction ${tx._id} — ${req.user.firstName} a ouvert un litige : ${reason || ""}`, `/admin`);

    res.json({ message: "Litige ouvert. VIT AUTO va examiner la situation.", transaction: tx });
  } catch (err) {
    logger.error("openDispute:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/import-export/transactions/:id/dispute/resolve  — admin
export const resolveDispute = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({ _id: req.params.id, status: "disputed" });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable." });

    const { resolution, releaseToPartner } = req.body;

    tx.dispute.resolution = resolution || null;
    tx.dispute.resolvedAt = new Date();
    tx.dispute.resolvedBy = req.user._id;

    if (releaseToPartner) {
      tx.payment.releasedAt = new Date();
      tx.status = "funds_released";
      pushHistory(tx, "funds_released", req.user._id, `Litige résolu — fonds libérés au fournisseur. ${resolution || ""}`);
    } else {
      // Remboursement ou annulation
      tx.status = "cancelled";
      pushHistory(tx, "cancelled", req.user._id, `Litige résolu — transaction annulée. ${resolution || ""}`);
    }
    await tx.save();

    await notify(tx.client,  releaseToPartner ? "info" : "success", "Litige résolu", `VIT AUTO a tranché : ${resolution || ""}`, `/import-export/transaction/${tx._id}`);
    await notify(tx.partner, releaseToPartner ? "success" : "error", "Litige résolu", `VIT AUTO a tranché : ${resolution || ""}`, `/importer-dashboard`);

    res.json({ message: "Litige résolu.", transaction: tx });
  } catch (err) {
    logger.error("resolveDispute:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ANNULATION (client ou partenaire, étapes précoces uniquement)
// PATCH /api/import-export/transactions/:id/cancel
// ═══════════════════════════════════════════════════════════════════════════

export const cancelTransaction = async (req, res) => {
  try {
    const cancellableStatuses = ["reserved", "confirmed", "in_discussion", "inspection_requested", "inspection_done", "offer_sent"];
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      status: { $in: cancellableStatuses },
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou annulation impossible à ce stade." });

    const isParticipant = [tx.client.toString(), tx.partner.toString()].includes(req.user._id.toString());
    const isAdmin       = req.user.role === "admin";
    if (!isParticipant && !isAdmin) return res.status(403).json({ message: "Accès refusé." });

    const { reason } = req.body;
    tx.status = "cancelled";
    pushHistory(tx, "cancelled", req.user._id, reason || "Annulation sans motif.");
    await tx.save();

    const otherParty = tx.client.toString() === req.user._id.toString() ? tx.partner : tx.client;
    await notify(otherParty, "error", "Transaction annulée", `La transaction a été annulée.${reason ? " Motif : " + reason : ""}`, `/import-export/transaction/${tx._id}`);

    res.json({ message: "Transaction annulée.", transaction: tx });
  } catch (err) {
    logger.error("cancelTransaction:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTATION
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/import-export/transactions/:id
export const getTransactionById = async (req, res) => {
  try {
    const tx = await IETransaction.findById(req.params.id)
      .populate("listing", "title make model year mainPhoto photos vin price currency sourceCountry")
      .populate("client",  "firstName lastName email profilePhoto phone")
      .populate("partner", "firstName lastName email profilePhoto phone business")
      .populate("independentInspection.assignedTo", "firstName lastName");

    if (!tx) return res.status(404).json({ message: "Transaction introuvable." });

    const isParticipant = [tx.client._id.toString(), tx.partner._id.toString()].includes(req.user._id.toString());
    const isAdmin       = req.user.role === "admin";
    if (!isParticipant && !isAdmin) return res.status(403).json({ message: "Accès refusé." });

    res.json({ transaction: tx });
  } catch (err) {
    logger.error("getTransactionById:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/transactions/mine  (client)
export const getClientTransactions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage  = Math.max(Number(page), 1);
    const filter = { client: req.user._id };
    if (status) filter.status = status;

    const [transactions, total] = await Promise.all([
      IETransaction.find(filter)
        .populate("listing", "title make model year mainPhoto price currency sourceCountry")
        .populate("partner", "firstName lastName profilePhoto business")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      IETransaction.countDocuments(filter),
    ]);

    res.json({ transactions, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getClientTransactions:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/transactions/partner  (partenaire)
export const getPartnerTransactions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage  = Math.max(Number(page), 1);
    const filter = { partner: req.user._id };
    if (status) filter.status = status;

    const [transactions, total] = await Promise.all([
      IETransaction.find(filter)
        .populate("listing", "title make model year mainPhoto price currency sourceCountry")
        .populate("client",  "firstName lastName profilePhoto email phone")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      IETransaction.countDocuments(filter),
    ]);

    res.json({ transactions, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getPartnerTransactions:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/transactions  — admin
export const getAllTransactions = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const safePage  = Math.max(Number(page), 1);
    const filter = {};
    if (status) filter.status = status;

    const [transactions, total] = await Promise.all([
      IETransaction.find(filter)
        .populate("listing", "title make model year mainPhoto price currency")
        .populate("client",  "firstName lastName email")
        .populate("partner", "firstName lastName email business")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      IETransaction.countDocuments(filter),
    ]);

    res.json({ transactions, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getAllTransactions:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RAPPORT D'INSPECTION FOURNISSEUR
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/import-export/listings/:id/inspection-report
export const createInspectionReport = async (req, res) => {
  try {
    const listing = await ImportExportListing.findOne({
      _id: req.params.id,
      partner: req.user._id,
    });
    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });

    // Un seul rapport par annonce
    const existing = await InspectionReport.findOne({ listing: req.params.id });
    if (existing) {
      Object.assign(existing, {
        ...req.body,
        partner: req.user._id,
        listing: req.params.id,
        updatedAt: new Date(),
      });
      await existing.save();
      await ImportExportListing.findByIdAndUpdate(req.params.id, { inspectionReport: existing._id });
      return res.json({ message: "Rapport d'inspection mis à jour.", report: existing });
    }

    // req.body EN PREMIER : listing/partner doivent toujours venir de l'URL/l'utilisateur
    // authentifié, jamais du client, sinon un partenaire pourrait rattacher son rapport
    // à l'annonce d'un concurrent (spoofing d'ownership).
    const report = await InspectionReport.create({
      ...req.body,
      listing: req.params.id,
      partner: req.user._id,
    });

    await ImportExportListing.findByIdAndUpdate(req.params.id, { inspectionReport: report._id });

    res.status(201).json({ message: "Rapport d'inspection publié.", report });
  } catch (err) {
    logger.error("createInspectionReport:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/import-export/listings/:id/inspection-report
export const getInspectionReport = async (req, res) => {
  try {
    const report = await InspectionReport.findOne({ listing: req.params.id, status: "published" })
      .populate("partner", "firstName lastName profilePhoto business");
    res.json({ report: report || null });
  } catch (err) {
    logger.error("getInspectionReport:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
