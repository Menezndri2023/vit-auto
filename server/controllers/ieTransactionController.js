import logger from "../utils/logger.js";
import IETransaction       from "../models/IETransaction.js";
import ImportExportListing  from "../models/ImportExportListing.js";
import InspectionReport     from "../models/InspectionReport.js";
import User                 from "../models/User.js";
import Notification         from "../models/Notification.js";
import Chat                 from "../models/Chat.js";
import PartnerOnboarding    from "../models/PartnerOnboarding.js";
import { dispatch } from "../queue/index.js";
import { stripeProvider } from "../services/payment/gateway.js";
import { foundingRateFor } from "../utils/foundingPartnerRates.js";

// Commission VIT AUTO sur une transaction Import/Export — même barème que la
// vente (foundingRateFor), puisque le partenaire d'une transaction IE est
// toujours un Founding Partner (isFounder requis pour publier, voir
// importExportController.createListing). Calculée une seule fois, à la
// libération des fonds — jamais recalculée ensuite.
async function computeIeCommission(tx) {
  const fp = await PartnerOnboarding.findOne({ userId: tx.partner, isFoundingPartner: true })
    .select("commissions.lockedAt legalEntityType")
    .lean();
  const rate = fp ? foundingRateFor(fp.commissions?.lockedAt, "vente", fp.legalEntityType) : 0.03; // 3% = tarif standard vente, repli si jamais non-fondateur
  const amount = Math.round((tx.payment.amount || 0) * rate * 100) / 100;
  return { rate, amount, payoutAmount: Math.round(((tx.payment.amount || 0) - amount) * 100) / 100 };
}

const MANUAL_PAYMENT_METHODS = ["virement", "mobile_money", "crypto", "lc"];
const LC_REQUIRED_DOCS = ["commercialInvoice", "billOfLading", "originCertificate", "inspectionDocs"];

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

// ── Profil de paiement du partenaire — purement informatif ────────────────
// Aucune méthode de paiement n'est jamais bloquée : ceci ne sert qu'à afficher
// une recommandation côté client (badge "Nouveau partenaire"/"Vérifié"/"Grand
// compte"), le client et le partenaire restant libres de choisir n'importe
// quelle option proposée.
const getPartnerPaymentProfile = async (partnerId) => {
  const [partner, completedCount] = await Promise.all([
    User.findById(partnerId).select("isFounder importerProfile.badgeLevel"),
    IETransaction.countDocuments({ partner: partnerId, status: { $in: ["completed", "funds_released"] } }),
  ]);

  let level = "nouveau";
  if (partner?.isFounder) {
    level = "grand_compte";
  } else if (completedCount >= 1 || ["gold", "platinum"].includes(partner?.importerProfile?.badgeLevel)) {
    level = "verifie";
  }

  const RECOMMENDATIONS = {
    nouveau:      { label: "Nouveau partenaire",  recommended: ["lc", "virement"] },
    verifie:      { label: "Partenaire vérifié",  recommended: ["virement", "carte"] },
    grand_compte: { label: "Grand compte / Founding Partner", recommended: ["virement", "carte", "lc"] },
  };

  return { level, completedCount, ...RECOMMENDATIONS[level] };
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

// Le paiement était auparavant entièrement auto-déclaré par le client : il
// choisissait "Carte bancaire"/"Mobile Money"/"Cryptomonnaie" dans un menu,
// tapait une référence arbitraire, et le statut passait DIRECTEMENT à
// "in_escrow" — sans la moindre vérification qu'un centime ait réellement
// changé de mains. Corrigé en deux volets : "carte" passe désormais par un
// vrai Stripe Checkout (webhook-confirmé, voir stripeWebhook dans
// paymentController.js) ; toute autre méthode (ou carte sans compte Stripe
// configuré) ne fait plus que déclarer une INTENTION de paiement — un admin
// doit vérifier la réception réelle des fonds (confirmEscrowPayment) avant
// que l'entiercement ne soit considéré comme sécurisé.
export const payEscrow = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      client: req.user._id,
      status: "payment_pending",
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou paiement non attendu." });

    const { method, transactionRef, lcReference, installment } = req.body;
    if (!method) return res.status(400).json({ message: "Moyen de paiement requis." });

    if (method === "carte" && stripeProvider.isConfigured()) {
      const base = (process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      const { checkoutUrl, providerRef } = await stripeProvider.createCheckout({
        payment: { _id: tx._id, amount: tx.finalOffer.totalAmount, devise: tx.finalOffer.currency },
        booking: { _id: tx._id, reference: `IE-${tx._id.toString().slice(-8).toUpperCase()}` },
        successUrl: `${base}/import-export/transaction/${tx._id}`,
        cancelUrl:  `${base}/import-export/transaction/${tx._id}`,
      });
      tx.payment.method          = method;
      tx.payment.currency        = tx.finalOffer.currency;
      tx.payment.amount          = tx.finalOffer.totalAmount;
      tx.payment.stripeSessionId = providerRef;
      await tx.save();
      return res.json({ message: "Redirection vers le paiement sécurisé.", checkoutUrl });
    }

    if (method === "lc" && !lcReference) {
      return res.status(400).json({ message: "Référence de la Lettre de Crédit (fournie par la banque du client) requise." });
    }

    // Acompte + solde (toute méthode manuelle) : le montant déclaré ici n'est
    // que l'acompte ; le solde est déclaré séparément via payInstallmentBalance
    // une fois l'acompte vérifié par VIT AUTO.
    const installmentEnabled = MANUAL_PAYMENT_METHODS.includes(method) && installment?.enabled === true;
    const depositPercent = installmentEnabled
      ? Math.min(Math.max(Number(installment.depositPercent) || 30, 1), 99)
      : null;
    const totalAmount = tx.finalOffer.totalAmount;
    const declaredAmount = installmentEnabled
      ? Math.round(totalAmount * depositPercent / 100)
      : totalAmount;

    tx.payment.method         = method;
    tx.payment.currency       = tx.finalOffer.currency;
    tx.payment.amount         = totalAmount;
    tx.payment.transactionRef = transactionRef || null;
    tx.payment.submittedAt    = new Date();

    if (method === "lc") {
      tx.payment.lc.reference = lcReference;
      tx.payment.lc.openedAt  = new Date();
    }

    if (installmentEnabled) {
      tx.payment.installment.enabled              = true;
      tx.payment.installment.depositPercent        = depositPercent;
      tx.payment.installment.depositAmount         = declaredAmount;
      tx.payment.installment.depositTransactionRef = transactionRef || null;
      tx.payment.installment.depositSubmittedAt    = new Date();
    }

    tx.status = "payment_submitted";
    const note = installmentEnabled
      ? `Acompte de ${depositPercent}% (${declaredAmount} ${tx.payment.currency}) déclaré via ${method} — en attente de vérification VIT AUTO.`
      : method === "lc"
        ? `Lettre de Crédit ouverte (réf. ${lcReference}) — documents d'export à fournir avant tout déblocage de fonds.`
        : `Paiement déclaré via ${method} — en attente de vérification VIT AUTO.`;
    pushHistory(tx, "payment_submitted", req.user._id, note);
    await tx.save();

    await notifyAdmins(
      "ie_payment",
      method === "lc" ? "Lettre de Crédit ouverte — à vérifier" : "Paiement à vérifier",
      `Transaction ${tx._id} — ${declaredAmount} ${tx.payment.currency} déclaré via ${method}${installmentEnabled ? " (acompte)" : ""}, en attente de confirmation.`,
      `/admin`
    );
    await notify(tx.partner, "info", "Paiement en cours de vérification", "Le client a déclaré son paiement — VIT AUTO vérifie la réception des fonds avant de sécuriser l'entiercement.", `/importer-dashboard`);

    res.json({ message: note, transaction: tx });
  } catch (err) {
    logger.error("payEscrow:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Déclaration du règlement du solde (méthodes avec acompte + solde) ──────
// POST /api/import-export/transactions/:id/pay-balance
export const payInstallmentBalance = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({
      _id: req.params.id,
      client: req.user._id,
      status: "payment_submitted",
    });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    const inst = tx.payment.installment;
    if (!inst?.enabled) {
      return res.status(400).json({ message: "Cette transaction ne fait pas l'objet d'un paiement en 2 fois (acompte + solde)." });
    }
    if (!inst.depositPaidAt) {
      return res.status(409).json({ message: "L'acompte n'a pas encore été vérifié par VIT AUTO — le solde ne peut pas encore être déclaré." });
    }
    if (inst.balanceSubmittedAt) {
      return res.status(409).json({ message: "Le règlement du solde a déjà été déclaré." });
    }

    const { transactionRef } = req.body;
    const balanceAmount = Math.max((tx.payment.amount || 0) - (inst.depositAmount || 0), 0);

    inst.balanceAmount         = balanceAmount;
    inst.balanceTransactionRef = transactionRef || null;
    inst.balanceSubmittedAt    = new Date();
    pushHistory(tx, "payment_submitted", req.user._id, `Solde de ${balanceAmount} ${tx.payment.currency} déclaré — en attente de vérification VIT AUTO.`);
    await tx.save();

    await notifyAdmins("ie_payment", "Solde à vérifier", `Transaction ${tx._id} — solde de ${balanceAmount} ${tx.payment.currency} déclaré.`, `/admin`);
    await notify(tx.partner, "info", "Solde déclaré", "Le client a déclaré le règlement du solde — VIT AUTO vérifie la réception des fonds.", `/importer-dashboard`);

    res.json({ message: "Solde déclaré. VIT AUTO vérifie la réception des fonds avant de sécuriser l'entiercement.", transaction: tx });
  } catch (err) {
    logger.error("payInstallmentBalance:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Appelée par le webhook Stripe (paymentController.js) une fois le paiement
// carte réellement confirmé — jamais par une déclaration client.
export async function completeIEEscrowPayment(tx, providerRef) {
  if (tx.status !== "payment_pending" && tx.status !== "payment_submitted") return;
  tx.payment.paidAt     = new Date();
  tx.payment.escrowRef  = `ESCROW-${tx._id.toString().slice(-8).toUpperCase()}-${Date.now()}`;
  if (providerRef) tx.payment.transactionRef = providerRef;
  tx.status = "in_escrow";
  pushHistory(tx, "in_escrow", null, "Paiement carte confirmé par Stripe — entiercement sécurisé.");
  await tx.save();

  await notify(tx.partner, "success", "Fonds sécurisés en entiercement !", `Le paiement de ${tx.payment.amount?.toLocaleString("fr-FR")} ${tx.payment.currency} est confirmé et sécurisé. Procédez à la préparation de l'export.`, `/importer-dashboard`);
  await notify(tx.client, "success", "Paiement confirmé", "Votre paiement carte a été confirmé et sécurisé en entiercement.", `/import-export/transaction/${tx._id}`);
}

// ── Admin : vérifier/rejeter un paiement manuel déclaré (virement, mobile
// money, crypto, ou carte sans Stripe configuré) ──────────────────────────
// PATCH /api/import-export/transactions/:id/verify-payment
export const confirmEscrowPayment = async (req, res) => {
  try {
    const tx = await IETransaction.findOne({ _id: req.params.id, status: "payment_submitted" });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou aucun paiement à vérifier." });

    const inst = tx.payment.installment;

    // Acompte + solde : la première confirmation ne valide que l'acompte —
    // l'entiercement n'est sécurisé qu'une fois le solde également vérifié.
    if (inst?.enabled && !inst.depositPaidAt) {
      inst.depositPaidAt     = new Date();
      inst.depositVerifiedBy = req.user._id;
      pushHistory(tx, "payment_submitted", req.user._id, `Acompte de ${inst.depositAmount} ${tx.payment.currency} vérifié — solde attendu avant sécurisation de l'entiercement.`);
      await tx.save();

      await notify(tx.client, "success", "Acompte vérifié", "VIT AUTO a vérifié votre acompte. Merci de régler le solde restant avant l'expédition du véhicule.", `/import-export/transaction/${tx._id}`);
      await notify(tx.partner, "info", "Acompte vérifié", `L'acompte de la transaction ${tx._id} est vérifié — solde du client attendu.`, `/importer-dashboard`);

      return res.json({ message: "Acompte vérifié. Le solde doit être réglé et vérifié avant la sécurisation complète de l'entiercement.", transaction: tx });
    }
    if (inst?.enabled && !inst.balanceSubmittedAt) {
      return res.status(409).json({ message: "Le client n'a pas encore déclaré le règlement du solde." });
    }

    // Lettre de Crédit : les documents d'export clés doivent être conformes
    // avant tout déblocage de fonds — condition réelle d'une LC bancaire.
    if (tx.payment.method === "lc") {
      const docsValid = LC_REQUIRED_DOCS.every((key) => tx.documents[key]?.status === "valide");
      if (!docsValid) {
        return res.status(409).json({ message: "Documents d'export non encore validés — la Lettre de Crédit ne peut libérer les fonds avant conformité documentaire (facture commerciale, connaissement, certificat d'origine, rapport d'inspection)." });
      }
      tx.payment.lc.documentsValidatedAt = new Date();
      tx.payment.lc.validatedBy          = req.user._id;
    }

    if (inst?.enabled) {
      inst.balancePaidAt     = new Date();
      inst.balanceVerifiedBy = req.user._id;
    }

    tx.payment.paidAt     = new Date();
    tx.payment.verifiedBy = req.user._id;
    tx.payment.escrowRef  = `ESCROW-${tx._id.toString().slice(-8).toUpperCase()}-${Date.now()}`;
    tx.status = "in_escrow";
    pushHistory(tx, "in_escrow", req.user._id, "Réception des fonds vérifiée par VIT AUTO — entiercement sécurisé.");
    await tx.save();

    await notify(tx.partner, "success", "Fonds sécurisés en entiercement !", `Le paiement de ${tx.payment.amount?.toLocaleString("fr-FR")} ${tx.payment.currency} est vérifié et sécurisé. Procédez à la préparation de l'export.`, `/importer-dashboard`);
    await notify(tx.client, "success", "Paiement confirmé", "Votre paiement a été vérifié et sécurisé en entiercement.", `/import-export/transaction/${tx._id}`);

    res.json({ message: "Paiement vérifié — entiercement sécurisé.", transaction: tx });
  } catch (err) {
    logger.error("confirmEscrowPayment:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/import-export/transactions/:id/reject-payment
export const rejectEscrowPayment = async (req, res) => {
  try {
    const { reason } = req.body;
    const tx = await IETransaction.findOne({ _id: req.params.id, status: "payment_submitted" });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou aucun paiement à vérifier." });

    // Un acompte déjà vérifié représente des fonds déjà reçus et confirmés —
    // le rejet global (retour à "payment_pending") effacerait cette
    // confirmation sans annuler réellement la réception des fonds. Ce cas
    // relève d'un litige, pas d'un simple rejet de déclaration non vérifiée.
    if (tx.payment.installment?.enabled && tx.payment.installment?.depositPaidAt) {
      return res.status(409).json({ message: "L'acompte de cette transaction a déjà été vérifié — ouvrez un litige plutôt que de rejeter le paiement dans son ensemble." });
    }

    tx.status = "payment_pending";
    pushHistory(tx, "payment_pending", req.user._id, `Paiement déclaré non confirmé${reason ? " : " + reason : ""} — le client doit soumettre une nouvelle preuve.`);
    await tx.save();

    await notify(tx.client, "error", "Paiement non confirmé", `VIT AUTO n'a pas pu vérifier votre paiement${reason ? ` (${reason})` : ""}. Merci de le soumettre à nouveau ou de nous contacter.`, `/import-export/transaction/${tx._id}`);

    res.json({ message: "Paiement rejeté — le client a été notifié.", transaction: tx });
  } catch (err) {
    logger.error("rejectEscrowPayment:", err);
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
    // "payment_submitted" est également accepté : une Lettre de Crédit exige que
    // les documents d'export soient fournis et validés AVANT le déblocage des
    // fonds (voir confirmEscrowPayment) — donc avant même l'entrée en escrow.
    const isAdmin = req.user.role === "admin";
    const filter = {
      _id: req.params.id,
      status: { $in: ["payment_submitted", "in_escrow", "preparing"] },
    };
    if (!isAdmin) filter.partner = req.user._id;

    const tx = await IETransaction.findOne(filter);
    if (!tx) return res.status(404).json({ message: "Transaction introuvable ou statut incompatible." });

    const { documents } = req.body;
    if (!documents || typeof documents !== "object") {
      return res.status(400).json({ message: "Données documents invalides." });
    }

    const allowed = ["commercialInvoice", "customsDocs", "originCertificate", "billOfLading", "inspectionDocs", "transportBooking"];
    for (const key of allowed) {
      if (documents[key]) {
        const incoming = { ...documents[key] };
        // Seul un admin VIT AUTO peut valider un document ("valide") — une
        // conformité indépendante est requise, en particulier pour la Lettre
        // de Crédit (voir confirmEscrowPayment) : le partenaire ne peut pas
        // s'auto-valider.
        if (incoming.status === "valide" && !isAdmin) delete incoming.status;
        tx.documents[key] = { ...tx.documents[key].toObject?.() || {}, ...incoming };
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

    const { rate, amount, payoutAmount } = await computeIeCommission(tx);
    tx.payment.commission = { rate, amount, payoutAmount, computedAt: new Date() };
    tx.payment.releasedAt = new Date();
    tx.status = "funds_released";
    pushHistory(tx, "funds_released", req.user._id, `Fonds libérés vers le fournisseur par ${isAdmin ? "l'admin" : "le client"} — commission VIT AUTO ${(rate * 100).toFixed(0)}% (${amount.toLocaleString("fr-FR")} ${tx.payment.currency}).`);
    await tx.save();

    await notify(tx.partner, "success", "Fonds libérés !", `${payoutAmount.toLocaleString("fr-FR")} ${tx.payment.currency} ont été versés sur votre compte (commission VIT AUTO ${(rate * 100).toFixed(0)}% déduite, sur un total de ${tx.payment.amount?.toLocaleString("fr-FR")} ${tx.payment.currency}).`, `/importer-dashboard`);
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
      const { rate, amount, payoutAmount } = await computeIeCommission(tx);
      tx.payment.commission = { rate, amount, payoutAmount, computedAt: new Date() };
      tx.payment.releasedAt = new Date();
      tx.status = "funds_released";
      pushHistory(tx, "funds_released", req.user._id, `Litige résolu — fonds libérés au fournisseur (commission VIT AUTO ${(rate * 100).toFixed(0)}%). ${resolution || ""}`);
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

    const paymentProfile = await getPartnerPaymentProfile(tx.partner._id);

    res.json({ transaction: tx, paymentProfile });
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
