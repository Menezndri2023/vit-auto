import logger from "../utils/logger.js";
import Lead from "../models/Lead.js";
import Quote from "../models/Quote.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import { sendViaEmail, sendViaSms } from "../services/communication/CommunicationService.js";

const APP_URL = process.env.APP_URL || "https://vit-auto.com";

// Champs autorisés à la création d'un lead (sous-ensemble strict)
const LEAD_CREATE_FIELDS = [
  "buyer", "vehicle", "budget", "destinationCountry", "destinationPort",
  "source", "status", "urgency", "internalNotes",
];

// Champs autorisés pour la mise à jour d'un lead (empêche l'injection de partnerId)
const LEAD_UPDATE_FIELDS = [
  "buyer", "vehicle", "budget", "destinationCountry", "destinationPort",
  "source", "status", "urgency", "score", "assignedTo",
  "internalNotes", "lostReason", "nextFollowUpAt", "firstContactAt", "closedAt",
];

// Champs autorisés pour la mise à jour d'un devis
// "leadId" manquait jusqu'ici : un devis créé depuis un lead n'y était jamais
// réellement rattaché (createQuote l'ignorait silencieusement), rendant tout
// le suivi devis↔lead impossible malgré leadId existant sur le modèle Quote.
const QUOTE_UPDATE_FIELDS = [
  "leadId", "buyer", "vehicles", "lines", "subtotal", "discount", "discountAmount",
  "taxRate", "taxAmount", "total", "currency", "incoterm", "paymentTerms",
  "paymentMethod", "portOfLoading", "portOfDischarge", "deliveryTime",
  "validityDays", "validUntil", "notes", "conditions", "status",
];

// Champs autorisés pour l'upsert showroom
const SHOWROOM_SAFE_FIELDS = [
  "logo", "banner", "coverVideo", "companyName", "tagline", "description",
  "foundedYear", "employeesCount", "showroomSurface", "annualCapacity",
  "brands", "vehicleTypes", "exportCountries", "exportPorts",
  "address", "city", "country", "mapLat", "mapLng",
  "phone", "whatsapp", "wechat", "email", "website", "social",
  "openingHours", "photos", "videos", "team", "certifications", "stats",
];

function pick(obj, fields) {
  return Object.fromEntries(fields.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

// Calcule les totaux d'un devis à partir de ses lignes
function calcTotals(data) {
  // Les montants ne sont jamais dérivés d'une valeur envoyée telle quelle par
  // l'appelant — recalculés uniquement depuis `lines`. Sans lignes dans cette
  // mise à jour, on retire les champs de total de `data` plutôt que de les
  // laisser passer tels quels (sinon un appel direct à l'API, hors UI, peut
  // fixer un total arbitraire — bug réel trouvé en audit).
  if (!data.lines?.length) {
    const { subtotal, discountAmount, taxAmount, total, ...rest } = data;
    return rest;
  }
  const subtotal      = data.lines.reduce((s, l) => s + (Number(l.qty) || 1) * (Number(l.unitPrice) || 0), 0);
  const discount      = Number(data.discount) || 0;
  const taxRate       = Number(data.taxRate) || 0;
  const discountAmount = Math.round(subtotal * (discount / 100));
  const afterDiscount  = subtotal - discountAmount;
  const taxAmount      = Math.round(afterDiscount * (taxRate / 100));
  return { ...data, subtotal, discountAmount, taxAmount, total: afterDiscount + taxAmount };
}

// Requête bookings pour un partenaire (via ses véhicules et chauffeurs)
async function getPartnerBookings(partnerId) {
  const vehicles = await Vehicle.find({ owner: partnerId }).select("_id");
  const vehicleIds = vehicles.map((v) => v._id);
  if (vehicleIds.length === 0) return [];
  return Booking.find({ vehicle: { $in: vehicleIds } }).lean();
}

// Échappe les caractères spéciaux pour une regex sûre
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS — Vue globale pour le dashboard PMS
// ══════════════════════════════════════════════════════════════
export async function getPMSOverview(req, res) {
  try {
    const partnerId = req.user._id;

    const [leads, quotes, bookings, vehicles, showroom] = await Promise.all([
      Lead.find({ partnerId }).lean(),
      Quote.find({ partnerId }).lean(),
      getPartnerBookings(partnerId),
      Vehicle.find({ owner: partnerId }).select("-images").lean(),
      PartnerShowroom.findOne({ partnerId }).lean(),
    ]);

    const leadsStats = {
      total:         leads.length,
      nouveau:       leads.filter((l) => l.status === "nouveau").length,
      contacte:      leads.filter((l) => l.status === "contacte").length,
      en_discussion: leads.filter((l) => l.status === "en_discussion").length,
      devis_envoye:  leads.filter((l) => l.status === "devis_envoye").length,
      negociation:   leads.filter((l) => l.status === "negociation").length,
      gagne:         leads.filter((l) => l.status === "gagne").length,
      perdu:         leads.filter((l) => l.status === "perdu").length,
      conversionRate: leads.length > 0
        ? Math.round((leads.filter((l) => l.status === "gagne").length / leads.length) * 100)
        : 0,
    };

    const quotesStats = {
      total:     quotes.length,
      envoye:    quotes.filter((q) => q.status === "envoye").length,
      accepte:   quotes.filter((q) => q.status === "accepte").length,
      brouillon: quotes.filter((q) => q.status === "brouillon").length,
    };

    const revenue = bookings.reduce((sum, b) => sum + (b.montantTotal || 0), 0);

    const leadsByCountry = leads.reduce((acc, l) => {
      const c = l.buyer?.country || l.destinationCountry || "Inconnu";
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});

    const now = new Date();
    const monthlyLeads = Array.from({ length: 6 }, (_, i) => {
      const d    = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return {
        month: d.toLocaleDateString("fr-FR", { month: "short" }),
        count: leads.filter((l) => {
          const t = new Date(l.createdAt);
          return t >= d && t < next;
        }).length,
      };
    });

    res.json({
      leadsStats,
      quotesStats,
      vehicles:  { total: vehicles.length, available: vehicles.filter((v) => v.available).length },
      revenue,
      bookings:  { total: bookings.length },
      showroom:  showroom ? { isPublished: showroom.isPublished, viewCount: showroom.viewCount } : null,
      leadsByCountry,
      monthlyLeads,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
// LEADS
// ══════════════════════════════════════════════════════════════
export async function getLeads(req, res) {
  try {
    const { status, page = 1 } = req.query;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const filter = { partnerId: req.user._id };
    if (status) filter.status = status;

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("assignedTo", "firstName lastName"),
      Lead.countDocuments(filter),
    ]);

    res.json({ leads, total, pages: Math.ceil(total / limit), page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function createLead(req, res) {
  try {
    const safe = pick(req.body, LEAD_CREATE_FIELDS);
    const lead = await Lead.create({ ...safe, partnerId: req.user._id });
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function getLead(req, res) {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, partnerId: req.user._id })
      .populate("assignedTo", "firstName lastName email");
    if (!lead) return res.status(404).json({ message: "Lead introuvable" });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function updateLead(req, res) {
  try {
    const safe = pick(req.body, LEAD_UPDATE_FIELDS);
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, partnerId: req.user._id },
      { $set: { ...safe, updatedAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!lead) return res.status(404).json({ message: "Lead introuvable" });
    res.json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function addLeadFollowUp(req, res) {
  try {
    const { note, method, outcome, nextAction } = req.body;
    const lead = await Lead.findOne({ _id: req.params.id, partnerId: req.user._id });
    if (!lead) return res.status(404).json({ message: "Lead introuvable" });
    lead.followUps.push({ note, method, outcome, date: new Date(),
      nextAction: nextAction ? new Date(nextAction) : undefined });
    if (nextAction) lead.nextFollowUpAt = new Date(nextAction);
    await lead.save();
    res.json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function addLeadMessage(req, res) {
  try {
    const { text, channel } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Message vide" });
    const lead = await Lead.findOne({ _id: req.params.id, partnerId: req.user._id });
    if (!lead) return res.status(404).json({ message: "Lead introuvable" });
    lead.messages.push({ from: "partner", text: text.trim(), channel: channel || "platform" });
    if (!lead.firstContactAt) lead.firstContactAt = new Date();
    if (lead.status === "nouveau") lead.status = "contacte";
    await lead.save();
    res.json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function deleteLead(req, res) {
  try {
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, partnerId: req.user._id });
    if (!lead) return res.status(404).json({ message: "Lead introuvable" });
    res.json({ message: "Lead supprimé" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
// QUOTES (DEVIS)
// ══════════════════════════════════════════════════════════════
export async function getQuotes(req, res) {
  try {
    const { status, page = 1 } = req.query;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const filter = { partnerId: req.user._id };
    if (status) filter.status = status;

    const [quotes, total] = await Promise.all([
      Quote.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Quote.countDocuments(filter),
    ]);

    res.json({ quotes, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Notifie l'acheteur (email/SMS + lien public) et synchronise le lead ─────
// Extrait de sendQuote pour être aussi appelé depuis createQuote : le
// constructeur de devis (PartnerPMSDashboard.jsx) peut créer ET envoyer en une
// seule action ("Créer & Envoyer" → POST /quotes avec status="envoye"
// directement, sans jamais appeler POST /quotes/:id/send) — sans ce partage,
// la notification acheteur ne partait que si le devis passait d'abord par le
// statut "brouillon" puis un envoi séparé.
async function dispatchQuoteToBuyer(quote, partnerId) {
  const partner = await User.findById(partnerId).select("firstName lastName business.name").lean();
  const partnerName = partner?.business?.name || `${partner?.firstName || ""} ${partner?.lastName || ""}`.trim() || "VIT AUTO";
  const totalFmt = `${Number(quote.total || 0).toLocaleString("fr-FR")} ${quote.currency}`;
  const quoteLink = `${APP_URL}/quote/${quote.publicToken}`;

  if (quote.buyer?.email) {
    sendViaEmail({
      to: quote.buyer.email,
      subject: `Devis ${quote.quoteNumber} — ${partnerName}`,
      html: `<p>Bonjour ${quote.buyer.name || ""},</p>
        <p>${partnerName} vous a envoyé un devis pour votre projet d'importation :</p>
        <p><strong>Devis n°${quote.quoteNumber}</strong><br/>Montant total : <strong>${totalFmt}</strong></p>
        <p><a href="${quoteLink}">👉 Consulter le devis en détail et répondre</a></p>
        <p>Vous pourrez accepter ou refuser directement en ligne, sans créer de compte.</p>`,
    }).catch((err) => logger.error("dispatchQuoteToBuyer email:", err));
  }
  if (quote.buyer?.phone) {
    sendViaSms({
      to: quote.buyer.phone,
      message: `VIT AUTO : ${partnerName} vous a envoyé le devis ${quote.quoteNumber} (${totalFmt}). Consultez-le et répondez ici : ${quoteLink}`,
    }).catch((err) => logger.error("dispatchQuoteToBuyer sms:", err));
  }

  if (quote.leadId) {
    // Filtré par partnerId en défense en profondeur (voir updateQuote — leadId
    // est désormais validé à l'écriture, mais un devis créé avant ce correctif
    // pourrait encore porter un leadId hors périmètre).
    await Lead.findOneAndUpdate({ _id: quote.leadId, partnerId }, { status: "devis_envoye", quoteId: quote._id }).catch(() => {});
  }
}

export async function createQuote(req, res) {
  try {
    const safe = pick(req.body, QUOTE_UPDATE_FIELDS);
    // Un leadId hors périmètre (autre partenaire) ne doit jamais être accepté
    // silencieusement — même garde que les autres endpoints partnerId-scopés.
    if (safe.leadId) {
      const lead = await Lead.findOne({ _id: safe.leadId, partnerId: req.user._id }).select("_id");
      if (!lead) return res.status(400).json({ message: "Lead introuvable." });
    }
    const data = calcTotals({ ...safe, partnerId: req.user._id });
    const quote = await Quote.create(data);

    if (quote.leadId) {
      await Lead.findByIdAndUpdate(quote.leadId, { quoteId: quote._id }).catch(() => {});
    }
    if (quote.status === "envoye") {
      quote.sentAt = new Date();
      await quote.save();
      await dispatchQuoteToBuyer(quote, req.user._id);
    }

    res.status(201).json(quote);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function getQuote(req, res) {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, partnerId: req.user._id });
    if (!quote) return res.status(404).json({ message: "Devis introuvable" });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function updateQuote(req, res) {
  try {
    const safe = pick(req.body, QUOTE_UPDATE_FIELDS);
    // Même garde que createQuote — sans elle, un partenaire pouvait rattacher
    // son devis au Lead d'UN AUTRE partenaire (IDOR), qui se retrouvait ensuite
    // modifié en écriture par dispatchQuoteToBuyer/respondPublicQuote.
    if (safe.leadId) {
      const lead = await Lead.findOne({ _id: safe.leadId, partnerId: req.user._id }).select("_id");
      if (!lead) return res.status(400).json({ message: "Lead introuvable." });
    }
    const data = calcTotals({ ...safe, updatedAt: new Date() });
    const quote = await Quote.findOneAndUpdate(
      { _id: req.params.id, partnerId: req.user._id },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!quote) return res.status(404).json({ message: "Devis introuvable" });
    res.json(quote);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// Le passage à "envoye" ne notifiait jamais réellement l'acheteur — le
// partenaire croyait le devis transmis alors que rien ne partait jamais vers
// buyer.email/buyer.phone (saisis au formulaire mais jamais utilisés). Le
// message ne contenait qu'un résumé texte SANS AUCUN LIEN — l'acheteur
// n'avait aucun moyen de consulter le détail ni de répondre en ligne. Manque
// réel trouvé en audit, corrigé par dispatchQuoteToBuyer (lien public).
export async function sendQuote(req, res) {
  try {
    const quote = await Quote.findOneAndUpdate(
      { _id: req.params.id, partnerId: req.user._id, status: { $in: ["brouillon", "envoye"] } },
      { $set: { status: "envoye", sentAt: new Date() } },
      { new: true }
    );
    if (!quote) return res.status(404).json({ message: "Devis introuvable ou non modifiable" });

    await dispatchQuoteToBuyer(quote, req.user._id);

    res.json(quote);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Consultation publique d'un devis (acheteur, sans compte) ────────────────
// Aucune route publique n'existait — le lien envoyé par email/SMS ci-dessus
// menait nulle part avant cet ajout. Le statut passe à "vu" au premier accès
// (viewedAt), jamais recalculé ensuite si déjà répondu/expiré.
export async function getPublicQuote(req, res) {
  try {
    const quote = await Quote.findOne({ publicToken: req.params.token });
    if (!quote) return res.status(404).json({ message: "Devis introuvable." });

    if (quote.status === "envoye") {
      quote.status = "vu";
      quote.viewedAt = new Date();
      await quote.save();
    }

    res.json(quote);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Réponse publique de l'acheteur (accepter/refuser) ───────────────────────
export async function respondPublicQuote(req, res) {
  try {
    const { action } = req.body;
    if (!["accept", "refuse"].includes(action)) {
      return res.status(400).json({ message: "Action invalide." });
    }

    const quote = await Quote.findOne({ publicToken: req.params.token });
    if (!quote) return res.status(404).json({ message: "Devis introuvable." });
    if (!["envoye", "vu"].includes(quote.status)) {
      return res.status(409).json({ message: "Ce devis a déjà reçu une réponse ou n'est plus disponible." });
    }

    quote.status = action === "accept" ? "accepte" : "refuse";
    quote.answeredAt = new Date();
    await quote.save();

    if (quote.leadId) {
      // Filtré par partnerId (celui du devis lui-même) en défense en
      // profondeur — route publique sans authentification, voir dispatchQuoteToBuyer.
      await Lead.findOneAndUpdate({ _id: quote.leadId, partnerId: quote.partnerId }, {
        status: action === "accept" ? "negociation" : "perdu",
        ...(action === "refuse" ? { lostReason: "Devis refusé par l'acheteur" } : {}),
      }).catch(() => {});
    }

    // Notifier le partenaire de la réponse — sans quoi il ne l'apprendrait
    // qu'en revérifiant manuellement le statut du devis.
    try {
      const Notification = (await import("../models/Notification.js")).default;
      await Notification.create({
        user: quote.partnerId,
        type: "system",
        titre: action === "accept" ? "✅ Devis accepté" : "❌ Devis refusé",
        message: `${quote.buyer?.name || "L'acheteur"} a ${action === "accept" ? "accepté" : "refusé"} le devis ${quote.quoteNumber}.`,
        lien: "/partner-pms",
      });
    } catch { /* non-bloquant */ }

    res.json(quote);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function deleteQuote(req, res) {
  try {
    const quote = await Quote.findOneAndDelete({ _id: req.params.id, partnerId: req.user._id });
    if (!quote) return res.status(404).json({ message: "Devis introuvable" });
    res.json({ message: "Devis supprimé" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
// SHOWROOM
// ══════════════════════════════════════════════════════════════
export async function getMyShowroom(req, res) {
  try {
    const showroom = await PartnerShowroom.findOne({ partnerId: req.user._id }).lean();
    res.json(showroom || { partnerId: req.user._id, isPublished: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function upsertShowroom(req, res) {
  try {
    const safe = pick(req.body, SHOWROOM_SAFE_FIELDS);
    const showroom = await PartnerShowroom.findOneAndUpdate(
      { partnerId: req.user._id },
      { $set: { ...safe, updatedAt: new Date() }, $setOnInsert: { partnerId: req.user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(showroom);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function publishShowroom(req, res) {
  try {
    // Upsert : crée le showroom s'il n'existe pas encore, puis publie
    const showroom = await PartnerShowroom.findOneAndUpdate(
      { partnerId: req.user._id },
      { $set: { isPublished: true, publishedAt: new Date() }, $setOnInsert: { partnerId: req.user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(showroom);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function getPublicShowroom(req, res) {
  try {
    const { id } = req.params;
    const isMongoId = /^[0-9a-f]{24}$/i.test(id);
    const filter = isMongoId
      ? { partnerId: id, isPublished: true }
      : { slug: id, isPublished: true };

    const showroom = await PartnerShowroom.findOne(filter).lean();
    if (!showroom) return res.status(404).json({ message: "Showroom non trouvé" });

    // Incrémenter les vues sans bloquer la réponse
    PartnerShowroom.findByIdAndUpdate(showroom._id, { $inc: { viewCount: 1 } }).exec();

    // Route publique, sans authentification — subscription/kycStatus (plan,
    // statut de facturation, vérification interne) ne doivent jamais y fuiter :
    // seul isFounder est réellement exploité par PartnerShowroomPublic.jsx.
    const partner = await User.findById(showroom.partnerId)
      .select("firstName lastName isFounder")
      .lean();

    res.json({ ...showroom, partnerInfo: partner });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function getPublicShowrooms(req, res) {
  try {
    const { country, brand, page = 1 } = req.query;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const filter = { isPublished: true };

    if (country) filter.exportCountries = { $in: [country] };
    if (brand) {
      // Échappement ReDoS : caractères spéciaux neutralisés
      filter.brands = { $in: [new RegExp(escapeRegex(brand), "i")] };
    }

    const [showrooms, total] = await Promise.all([
      PartnerShowroom.find(filter)
        .select("-photos -videos -team -openingHours")
        .sort({ "trustScore.overall": -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PartnerShowroom.countDocuments(filter),
    ]);

    res.json({ showrooms, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
// PERFORMANCE SCORE (calcul en temps réel)
// ══════════════════════════════════════════════════════════════
export async function getPerformanceScore(req, res) {
  try {
    const partnerId = req.user._id;

    const [leads, quotes, bookings] = await Promise.all([
      Lead.find({ partnerId }).lean(),
      Quote.find({ partnerId }).lean(),
      getPartnerBookings(partnerId),
    ]);

    const totalOrders      = bookings.length;
    const completed        = bookings.filter((b) => b.status === "completed").length;
    const cancelled        = bookings.filter((b) => b.status === "cancelled").length;
    const leadsTotal       = leads.length;
    const leadsWon         = leads.filter((l) => l.status === "gagne").length;
    const quotesAccepted   = quotes.filter((q) => q.status === "accepte").length;
    const quotesTotal      = quotes.filter((q) => q.status !== "brouillon").length;

    const completionRate   = totalOrders > 0 ? Math.round((completed / totalOrders) * 100) : 0;
    const cancellationRate = totalOrders > 0 ? Math.round((cancelled / totalOrders) * 100) : 0;
    const conversionRate   = leadsTotal   > 0 ? Math.round((leadsWon / leadsTotal) * 100) : 0;
    const quoteRate        = quotesTotal  > 0 ? Math.round((quotesAccepted / quotesTotal) * 100) : 0;

    // Score /100 — pondération selon l'activité réelle
    const hasActivity = totalOrders + leadsTotal + quotesTotal > 0;
    const score = hasActivity
      ? Math.min(Math.round(
          completionRate   * 0.35 +
          (100 - cancellationRate) * 0.20 +
          conversionRate   * 0.25 +
          quoteRate        * 0.20
        ), 100)
      : 0;

    // Mise à jour du trust score du showroom (sans bloquer si absent)
    PartnerShowroom.findOneAndUpdate(
      { partnerId },
      { $set: {
        "trustScore.overall":          score,
        "trustScore.completionRate":   completionRate,
        "trustScore.cancellationRate": cancellationRate,
        "trustScore.lastUpdated":      new Date(),
      } }
    ).exec();

    res.json({
      score,
      completionRate,
      cancellationRate,
      conversionRate,
      quoteRate,
      totalOrders,
      completed,
      cancelled,
      leadsTotal,
      leadsWon,
      quotesTotal,
      quotesAccepted,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── ADMIN — Stats globales PMS ────────────────────────────────────────────────
export async function getAdminPMSStats(req, res) {
  try {
    const [totalShowrooms, publishedShowrooms, totalLeads, wonLeads, totalQuotes, acceptedQuotes] = await Promise.all([
      PartnerShowroom.countDocuments(),
      PartnerShowroom.countDocuments({ isPublished: true }),
      Lead.countDocuments(),
      Lead.countDocuments({ status: "gagne" }),
      Quote.countDocuments(),
      Quote.countDocuments({ status: "accepte" }),
    ]);
    res.json({ totalShowrooms, publishedShowrooms, totalLeads, wonLeads, totalQuotes, acceptedQuotes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── ADMIN — Liste tous les showrooms partenaires ──────────────────────────────
export async function getAdminShowrooms(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page  = Math.max(Number(req.query.page) || 1, 1);
    const filter = {};
    if (req.query.published === "true")  filter.isPublished = true;
    if (req.query.published === "false") filter.isPublished = false;

    const [showrooms, total] = await Promise.all([
      PartnerShowroom.find(filter)
        .populate("partnerId", "firstName lastName email phone kycStatus certificationBadge isActive role")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PartnerShowroom.countDocuments(filter),
    ]);
    res.json({ showrooms, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── ADMIN — Forcer publication / dépublication d'un showroom ─────────────────
export async function adminToggleShowroom(req, res) {
  try {
    const showroom = await PartnerShowroom.findById(req.params.id);
    if (!showroom) return res.status(404).json({ message: "Showroom introuvable" });
    showroom.isPublished = !showroom.isPublished;
    await showroom.save();
    res.json({ isPublished: showroom.isPublished });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}
