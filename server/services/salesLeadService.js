// ── Service du parcours « vente par demande d'essai » ───────────────────────
//
// VISIBILITÉ → LEAD → DEMANDE D'ESSAI → RENDEZ-VOUS → ESSAI → OPPORTUNITÉ → VENTE.
// Point d'entrée UNIQUE pour toute évolution d'un SalesLead, quel que soit le
// canal (formulaire public, dashboards, planificateur, admin) : la table de
// transitions du workflow (constants/leadWorkflows.js) est vérifiée ici et
// nulle part ailleurs, et chaque passage écrit l'historique horodaté (§18).
// Voir docs/vente-demande-essai.md.
import mongoose from "mongoose";
import SalesLead from "../models/SalesLead.js";
import Vehicle from "../models/Vehicle.js";
import CommissionLedger from "../models/CommissionLedger.js";
import logger from "../utils/logger.js";
import { getConfig, resolveCommissionRate } from "./pricingEngine.js";
import { convertAmount } from "./currencyEngine.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { resolveOriginCode } from "../constants/importOrigins.js";
import { prochainNumero, formatReference } from "../utils/sequence.js";
import {
  canTransition, getWorkflow, SALE_LEAD_LABELS, TEST_DRIVE_OUTCOMES, COMMERCIAL_OUTCOMES, FOLLOW_UP_RESPONSES,
} from "../constants/leadWorkflows.js";
import { notifyPartner, notifyClient, notifyAdminsLead } from "./salesLeadNotifier.js";
import { nonBloquant } from "../utils/nonBloquant.js";

const SLOT_LABELS = { morning: "Matin", afternoon: "Après-midi", evening: "Soir", custom: "Créneau personnalisé" };
const TEST_DRIVE_DURATION_MS = 60 * 60 * 1000;

// `.lean()` n'applique pas les défauts Mongoose : un document PricingConfig
// créé avant l'ajout du bloc salesLead n'en a pas — on complète toujours avec
// les défauts pour ne jamais lire `undefined` sur un taux ou un délai.
export async function getSalesLeadConfig() {
  const config = await getConfig();
  return { ...DEFAULT_PRICING_CONFIG.salesLead, ...(config?.salesLead || {}) };
}

// ── Utilitaires ────────────────────────────────────────────────────────────

export class LeadError extends Error {
  constructor(statusCode, message, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizePhone(v) {
  if (!v) return null;
  const s = String(v).trim().replace(/[\s.\-()]/g, "");
  return s.length >= 6 ? s : null;
}

function clean(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

async function generateReference() {
  const year = new Date().getFullYear();
  // Compteur atomique par année (utils/sequence.js), amorcé depuis les
  // références existantes ; l'index unique reste le filet de dernier recours.
  const numero = await prochainNumero(`salesLead:${year}`, () =>
    SalesLead.countDocuments({ reference: { $regex: new RegExp(`^VA-LEAD-${year}-`) } }));
  return formatReference("VA-LEAD", year, numero);
}

export function slotLabel(slot, customSlot) {
  if (slot === "custom") return customSlot || SLOT_LABELS.custom;
  return SLOT_LABELS[slot] || "";
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Dates CALENDAIRES (jour souhaité, jour du rendez-vous, jour de vente) :
// une chaîne "YYYY-MM-DD" lue par `new Date()` vaut minuit UTC, donc la
// VEILLE pour tout fuseau à l'ouest de Greenwich — le 15 saisi par le client
// s'affichait « 14 » chez l'admin (vu en vérification locale). Le jour est
// ancré à midi UTC : le même jour civil partout où VIT AUTO opère, et l'heure
// du rendez-vous reste portée par la chaîne `time` pour l'affichage.
function parseCalendarDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  const str = String(value);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// Combine une date calendaire et une heure "HH:MM" (heure locale du
// partenaire, exprimée en UTC — Abidjan et Casablanca sont à UTC+0/+1) en un
// instant utilisé pour ordonner les rappels ; l'affichage repasse par `time`.
function combineDateTime(date, time) {
  const d = parseCalendarDate(date);
  if (!d) return null;
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, 0));
  }
  return d;
}

// Aujourd'hui, minuit UTC — borne "pas dans le passé" cohérente avec les
// dates calendaires ancrées à midi UTC.
function todayUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// Écrit l'historique et applique la transition — refuse tout passage absent
// de la table du workflow (sauf `force`, réservé à l'intervention admin).
export function transition(lead, to, { actorType = "SYSTEM", actorId = null, source = "API", action = null, metadata = null, force = false } = {}) {
  const from = lead.status;
  if (from !== to && !force && !canTransition(lead.workflow, from, to)) {
    throw new LeadError(409, `Transition impossible : ${SALE_LEAD_LABELS[from] || from} → ${SALE_LEAD_LABELS[to] || to}.`, "INVALID_TRANSITION");
  }
  lead.status = to;
  lead.history.push({ action: action || `status_${to.toLowerCase()}`, actorType, actorId, source, from, to, metadata });

  const now = new Date();
  const m = lead.milestones;
  if (to === "SENT_TO_PARTNER"      && !m.sentToPartnerAt) m.sentToPartnerAt = now;
  if (to === "TEST_DRIVE_SCHEDULED")                        m.scheduledAt = now;
  if (to === "TEST_DRIVE_COMPLETED" && !m.completedAt)     m.completedAt = now;
  if (to === "CUSTOMER_INTERESTED"  && !m.interestedAt)    m.interestedAt = now;
  if (to === "NEGOTIATION"          && !m.negotiationAt)   m.negotiationAt = now;
  if (to === "SOLD")                                        m.soldAt = now;
  if (to === "LOST")                                        m.lostAt = now;
}

export function logEvent(lead, action, { actorType = "SYSTEM", actorId = null, source = "API", metadata = null } = {}) {
  lead.history.push({ action, actorType, actorId, source, from: lead.status, to: lead.status, metadata });
}

// Première réaction du partenaire (accepter / autre créneau / refuser) —
// alimente le temps de réponse moyen (§16).
function markPartnerResponded(lead) {
  if (lead.milestones.partnerFirstResponseAt) return;
  const now = new Date();
  lead.milestones.partnerFirstResponseAt = now;
  if (lead.milestones.sentToPartnerAt) {
    lead.sla.responseTimeMs = now.getTime() - new Date(lead.milestones.sentToPartnerAt).getTime();
  }
}

// ── §2 Création + §3 qualification ─────────────────────────────────────────

export function qualify(lead, cfg) {
  const reasons = [];
  const price = lead.listingSnapshot?.priceUSD || 0;
  if (price >= cfg.highValueUSD)          reasons.push("high_value");
  else if (price >= cfg.mediumValueUSD)   reasons.push("medium_value");
  if (lead.flags.multipleVehicles)        reasons.push("multiple_vehicles");
  if (lead.flags.international)           reasons.push("international");
  if (lead.flags.professional)            reasons.push("professional");
  if (lead.flags.financing)               reasons.push("financing");
  if (lead.flags.urgent)                  reasons.push("urgent");

  let level = 1;
  if (reasons.some((r) => ["high_value", "multiple_vehicles", "international", "professional"].includes(r))) level = 3;
  else if (reasons.length) level = 2;

  lead.qualification.level = level;
  lead.qualification.reasons = reasons;
  lead.qualification.qualifiedAt = new Date();
  if (level === 2 && cfg.level2AutoSendMinutes > 0) {
    lead.qualification.autoSendAt = new Date(Date.now() + cfg.level2AutoSendMinutes * 60 * 1000);
  }
  return level;
}

export async function createLead({ vehicleId, user = null, body = {}, source = "API", ip = null }) {
  if (!mongoose.Types.ObjectId.isValid(vehicleId)) throw new LeadError(400, "Véhicule invalide.");
  const vehicle = await Vehicle.findById(vehicleId).populate("owner", "_id firstName lastName country").lean();
  if (!vehicle) throw new LeadError(404, "Véhicule introuvable.");
  if (vehicle.type !== "vente") throw new LeadError(400, "Une demande d'essai ne concerne qu'un véhicule à vendre.", "NOT_FOR_SALE");
  if (vehicle.status !== "approved" || vehicle.available === false) throw new LeadError(409, "Ce véhicule n'est plus disponible.", "UNAVAILABLE");
  if (!vehicle.owner?._id) throw new LeadError(409, "Annonce sans partenaire rattaché.");

  const firstName = clean(body.firstName, 80);
  const phone     = normalizePhone(body.phone);
  if (!firstName || !phone) throw new LeadError(400, "Nom et téléphone requis.");
  if (!body.consent) throw new LeadError(400, "Merci de confirmer que vous souhaitez être contacté au sujet de cet essai.", "CONSENT_REQUIRED");

  const requestType = body.requestType === "callback" ? "callback" : "test_drive";
  let requestedDate = null;
  let slot = null;
  if (requestType === "test_drive") {
    requestedDate = parseCalendarDate(body.date);
    if (!requestedDate) throw new LeadError(400, "Date souhaitée requise.");
    if (requestedDate < todayUTC()) throw new LeadError(400, "La date souhaitée ne peut pas être dans le passé.");
    slot = ["morning", "afternoon", "evening", "custom"].includes(body.slot) ? body.slot : null;
    if (!slot) throw new LeadError(400, "Créneau souhaité requis.");
    if (slot === "custom" && !clean(body.customSlot, 80)) throw new LeadError(400, "Précisez votre créneau.");
  }

  // Un véhicule à l'étranger s'achète à l'import, il ne se visite pas —
  // même règle que bookingController (IMPORT_VEHICLE_NO_TEST_DRIVE).
  const clientCountry = (user?.country || clean(body.country, 2) || null)?.toUpperCase() || null;
  const origineImport = resolveOriginCode(vehicle.country);
  if (requestType === "test_drive" && origineImport && clientCountry && vehicle.country !== clientCountry) {
    throw new LeadError(400, "Ce véhicule se trouve à l'étranger : il s'achète à l'import, il ne se visite pas.", "IMPORT_VEHICLE_NO_TEST_DRIVE");
  }

  // Doublon : même téléphone, même véhicule, dossier encore ouvert → on rend
  // le lead existant plutôt que d'en ouvrir un second (pas de double
  // attribution, pas de double notification partenaire).
  const wf = getWorkflow("SALE_TEST_DRIVE");
  const existing = await SalesLead.findOne({
    vehicle: vehicle._id, "client.phone": phone, status: { $nin: wf.terminal },
  });
  if (existing) return { lead: existing, duplicate: true };

  const cfg = await getSalesLeadConfig();
  const lead = new SalesLead({
    vehicle:    vehicle._id,
    partner:    vehicle.owner._id,
    businessId: vehicle.business || null,
    client: {
      userId:    user?._id || null,
      firstName,
      lastName:  clean(body.lastName, 80) || "",
      phone,
      whatsapp:  normalizePhone(body.whatsapp) || phone,
      email:     clean(body.email, 120)?.toLowerCase() || user?.email || null,
      city:      clean(body.city, 80),
      country:   clientCountry,
      language:  clean(body.language, 5) || "fr",
      consent:   true,
      consentAt: new Date(),
    },
    listingSnapshot: {
      title:    vehicle.title,
      marque:   vehicle.marque,
      modele:   vehicle.modele,
      annee:    vehicle.annee,
      priceUSD: vehicle.priceForSale ?? null,
      currency: vehicle.priceEntryCurrency || vehicle.currency || "USD",
      ville:    vehicle.ville,
      country:  vehicle.country,
      image:    vehicle.thumbnail || vehicle.images?.[0] || null,
    },
    sourceDetail: requestType === "callback" ? "callback" : "vehicle_page",
    requestType,
    requested: {
      date:       requestedDate,
      slot,
      customSlot: slot === "custom" ? clean(body.customSlot, 80) : null,
      message:    clean(body.message, 1000),
    },
    flags: {
      financing:        !!body.financing,
      multipleVehicles: !!body.multipleVehicles,
      urgent:           !!body.urgent,
      international:    !!(clientCountry && vehicle.country && clientCountry !== vehicle.country),
      professional:     !!(user && user.role === "partenaire"),
    },
    attribution: {
      windowDays: cfg.attributionDays,
      expiresAt:  new Date(Date.now() + cfg.attributionDays * 86400000),
    },
    contact: { disclosureStage: cfg.contactDisclosureStage },
  });
  lead.history.push({ action: "lead_created", actorType: "CLIENT", actorId: user?._id || null, source, metadata: { ip, requestType } });

  const level = qualify(lead, cfg);
  lead.history.push({ action: "lead_qualified", actorType: "SYSTEM", source: "SYSTEM", metadata: { level, reasons: lead.qualification.reasons } });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      lead.reference = await generateReference();
      await lead.save();
      break;
    } catch (err) {
      if (err?.code === 11000 && attempt < 2) continue;
      throw err;
    }
  }

  await notifyClient(lead, {
    titre:   "✅ Demande d'essai reçue",
    message: `Votre demande ${lead.reference} pour ${lead.listingSnapshot.title} est enregistrée. Le vendeur vous répond rapidement — suivez votre rendez-vous depuis votre espace.`,
    whatsapp: `VIT AUTO — Demande d'essai ${lead.reference} bien reçue pour ${lead.listingSnapshot.title}. Suivi :`,
  });

  if (level === 1) {
    await sendToPartner(lead, { actorType: "SYSTEM", source: "SYSTEM" });
  } else {
    transition(lead, "QUALIFYING", { actorType: "SYSTEM", source: "SYSTEM", action: "qualification_required", metadata: { level } });
    await lead.save();
    await notifyAdminsLead(lead,
      level === 3 ? "🔥 Lead à forte valeur à qualifier" : "🔎 Lead à qualifier",
      `${lead.reference} — ${lead.listingSnapshot.title} — ${lead.client.firstName} (${lead.client.city || "ville inconnue"}) — ${lead.qualification.reasons.join(", ")}.`);
  }

  return { lead, duplicate: false };
}

// ── §4 Transmission au partenaire ───────────────────────────────────────────

export async function sendToPartner(lead, { actorType = "SYSTEM", actorId = null, source = "SYSTEM" } = {}) {
  transition(lead, "SENT_TO_PARTNER", { actorType, actorId, source, action: "lead_sent_to_partner" });
  // Nouveau cycle de réponse (re-transmission après un autre créneau choisi
  // par le client) : les rappels repartent de zéro.
  lead.milestones.sentToPartnerAt = new Date();
  lead.sla.reminder1SentAt = null;
  lead.sla.reminder2SentAt = null;
  lead.sla.escalatedAt = null;
  if (lead.contact.disclosureStage === "SENT_TO_PARTNER" && !lead.contact.disclosedToPartnerAt) {
    lead.contact.disclosedToPartnerAt = new Date();
    logEvent(lead, "contact_disclosed", { actorType: "SYSTEM", source: "SYSTEM" });
  }
  await lead.save();

  const when = lead.requestType === "callback"
    ? "souhaite être rappelé"
    : `souhaite essayer le véhicule le ${fmtDate(lead.requested.date)} (${slotLabel(lead.requested.slot, lead.requested.customSlot)})`;
  await notifyPartner(lead, {
    titre:   "🚗 Nouvelle demande d'essai VIT AUTO",
    message: `${lead.reference} — ${lead.listingSnapshot.title} : ${lead.client.firstName} (${lead.client.city || "ville non précisée"}) ${when}. Répondez sous 2 h : Accepter, proposer un autre créneau ou refuser.`,
    whatsappText: `VIT AUTO — Nouvelle demande d'essai ${lead.reference} : ${lead.listingSnapshot.title}, ${lead.client.firstName} (${lead.client.city || "-"}), ${when}. Répondez depuis votre tableau de bord : ${(process.env.APP_URL || "https://vit-auto.com").replace(/\/$/, "")}/vendor/dashboard?tab=opportunites`,
  });
  return lead;
}

// ── §5 Acceptation → essai confirmé ─────────────────────────────────────────

export async function partnerAccept(lead, { actorId, source = "DASHBOARD", time = null, address = null, instructions = null, date = null } = {}) {
  const apptDate = combineDateTime(date || lead.requested.date, time);
  if (lead.requestType === "test_drive" && !apptDate) throw new LeadError(400, "Date du rendez-vous requise.");
  markPartnerResponded(lead);
  transition(lead, "PARTNER_ACCEPTED", { actorType: "PARTNER", actorId, source, action: "partner_accepted" });
  lead.appointment.date         = apptDate;
  lead.appointment.time         = clean(time, 5);
  lead.appointment.endAt        = apptDate ? new Date(apptDate.getTime() + TEST_DRIVE_DURATION_MS) : null;
  lead.appointment.address      = clean(address, 300);
  lead.appointment.instructions = clean(instructions, 500);
  lead.appointment.confirmedAt  = new Date();
  disclose(lead);

  // Demande de rappel sans date : le vendeur s'engage à rappeler, le dossier
  // s'arrête à « accepté » jusqu'au résultat qu'il déclarera (§9).
  if (!apptDate) {
    await lead.save();
    await notifyClient(lead, {
      titre:   "📞 Le vendeur va vous rappeler",
      message: `${lead.listingSnapshot.title} — le vendeur a bien reçu votre demande et vous contacte au ${lead.client.phone}.`,
      sms:     `VIT AUTO — Le vendeur de ${lead.listingSnapshot.title} va vous rappeler. Suivi :`,
    });
    return lead;
  }

  // Le créneau accepté est celui demandé par le client : confirmation
  // implicite, l'essai est programmé dans la même transaction.
  transition(lead, "TEST_DRIVE_SCHEDULED", { actorType: "SYSTEM", source: "SYSTEM", action: "appointment_confirmed" });
  await lead.save();

  const hour = lead.appointment.time ? ` à ${lead.appointment.time}` : ` (${slotLabel(lead.requested.slot, lead.requested.customSlot)})`;
  const addr = lead.appointment.address ? ` — ${lead.appointment.address}` : "";
  const instr = lead.appointment.instructions ? ` Instructions : ${lead.appointment.instructions}` : "";
  await notifyClient(lead, {
    titre:    "✅ Votre essai est confirmé",
    message:  `${lead.listingSnapshot.title} — ${fmtDate(lead.appointment.date)}${hour}${addr}.${instr} Retrouvez tous les détails et le contact du service client dans votre espace.`,
    sms:      `Essai confirmé : ${lead.listingSnapshot.title}, ${fmtDate(lead.appointment.date)}${hour}. Détails :`,
    whatsapp: `VIT AUTO — Votre essai est confirmé ✅\n${lead.listingSnapshot.title}\n${fmtDate(lead.appointment.date)}${hour}${addr}${instr}\nDétails :`,
  });
  return lead;
}

function disclose(lead) {
  if (!lead.contact.disclosedToPartnerAt) {
    lead.contact.disclosedToPartnerAt = new Date();
    logEvent(lead, "contact_disclosed", { actorType: "SYSTEM", source: "SYSTEM" });
  }
}

// ── §6 Autre créneau ────────────────────────────────────────────────────────

export async function partnerProposeAlternative(lead, { actorId, source = "DASHBOARD", date, slot = null, time = null, note = null } = {}) {
  const altDate = combineDateTime(date, time);
  if (!altDate) throw new LeadError(400, "Nouvelle date requise.");
  if (altDate < new Date()) throw new LeadError(400, "Le créneau proposé est déjà passé.");
  markPartnerResponded(lead);
  transition(lead, "ALTERNATIVE_PROPOSED", { actorType: "PARTNER", actorId, source, action: "alternative_proposed", metadata: { date: altDate, slot, time } });
  lead.alternative = {
    date: altDate, slot: clean(slot, 20), time: clean(time, 5), note: clean(note, 500),
    proposedAt: new Date(), clientResponse: "pending", respondedAt: null,
  };
  disclose(lead);
  await lead.save();

  const hour = lead.alternative.time ? ` à ${lead.alternative.time}` : lead.alternative.slot ? ` (${slotLabel(lead.alternative.slot)})` : "";
  await notifyClient(lead, {
    titre:    "🔄 Le vendeur vous propose un nouveau créneau",
    message:  `Pour ${lead.listingSnapshot.title} : ${fmtDate(altDate)}${hour}${lead.alternative.note ? ` — ${lead.alternative.note}` : ""}. Acceptez ou choisissez un autre créneau depuis votre espace.`,
    sms:      `Le vendeur propose un nouveau créneau pour votre essai : ${fmtDate(altDate)}${hour}. Répondre :`,
    whatsapp: `VIT AUTO — Le vendeur vous propose un nouveau créneau pour votre essai ${lead.listingSnapshot.title} : ${fmtDate(altDate)}${hour}. Répondre :`,
  });
  return lead;
}

export async function clientRespondAlternative(lead, { accept, newDate = null, newSlot = null, customSlot = null, actorId = null, source = "PUBLIC_LINK" } = {}) {
  if (lead.status !== "ALTERNATIVE_PROPOSED" || lead.alternative?.clientResponse !== "pending") {
    throw new LeadError(409, "Aucun créneau en attente de votre réponse.");
  }
  lead.alternative.respondedAt = new Date();
  if (accept) {
    lead.alternative.clientResponse = "accepted";
    transition(lead, "CUSTOMER_CONFIRMED", { actorType: "CLIENT", actorId, source, action: "customer_confirmed_alternative" });
    lead.appointment.date        = lead.alternative.date;
    lead.appointment.time        = lead.alternative.time;
    lead.appointment.endAt       = new Date(new Date(lead.alternative.date).getTime() + TEST_DRIVE_DURATION_MS);
    lead.appointment.confirmedAt = new Date();
    transition(lead, "TEST_DRIVE_SCHEDULED", { actorType: "SYSTEM", source: "SYSTEM", action: "appointment_confirmed" });
    await lead.save();
    const hour = lead.appointment.time ? ` à ${lead.appointment.time}` : "";
    await notifyPartner(lead, {
      titre:   "📅 Créneau accepté par le client",
      message: `${lead.reference} — ${lead.client.firstName} a accepté le ${fmtDate(lead.appointment.date)}${hour} pour ${lead.listingSnapshot.title}.`,
    });
    await notifyClient(lead, {
      titre:   "✅ Votre essai est confirmé",
      message: `${lead.listingSnapshot.title} — ${fmtDate(lead.appointment.date)}${hour}${lead.appointment.address ? ` — ${lead.appointment.address}` : ""}.`,
      sms:     `Essai confirmé : ${lead.listingSnapshot.title}, ${fmtDate(lead.appointment.date)}${hour}. Détails :`,
    });
    return lead;
  }

  const d = parseCalendarDate(newDate);
  if (!d) throw new LeadError(400, "Indiquez la nouvelle date souhaitée.");
  if (d < todayUTC()) throw new LeadError(400, "La date souhaitée ne peut pas être dans le passé.");
  const slot = ["morning", "afternoon", "evening", "custom"].includes(newSlot) ? newSlot : null;
  if (!slot) throw new LeadError(400, "Créneau souhaité requis.");
  lead.alternative.clientResponse = "declined";
  lead.requested.date = d;
  lead.requested.slot = slot;
  lead.requested.customSlot = slot === "custom" ? clean(customSlot, 80) : null;
  logEvent(lead, "customer_chose_other_slot", { actorType: "CLIENT", actorId, source, metadata: { date: d, slot } });
  // Repart vers le partenaire, avec un nouveau cycle de réponse.
  await sendToPartner(lead, { actorType: "CLIENT", actorId, source });
  return lead;
}

// ── Refus / annulation ──────────────────────────────────────────────────────

export async function partnerRefuse(lead, { actorId, source = "DASHBOARD", reason = "vehicle_unavailable", note = null } = {}) {
  markPartnerResponded(lead);
  transition(lead, "LOST", { actorType: "PARTNER", actorId, source, action: "partner_refused", metadata: { reason, note } });
  lead.lostReason = reason === "vehicle_unavailable" ? "Véhicule indisponible" : (clean(note, 300) || "Refusé par le vendeur");
  await lead.save();
  await notifyClient(lead, {
    titre:   "❌ Essai non disponible",
    message: `Le vendeur ne peut pas honorer votre demande pour ${lead.listingSnapshot.title} (${lead.lostReason.toLowerCase()}). Découvrez d'autres véhicules similaires sur VIT AUTO.`,
    sms:     `Votre demande d'essai ${lead.reference} n'a pas pu être honorée. Voir d'autres véhicules :`,
  });
  await notifyAdminsLead(lead, "⚠️ Demande d'essai refusée", `${lead.reference} — ${lead.listingSnapshot.title} refusée par le partenaire (${lead.lostReason}).`);
  return lead;
}

export async function cancelLead(lead, { by = "client", actorId = null, source = "PUBLIC_LINK", reason = null } = {}) {
  transition(lead, "CANCELLED", { actorType: by === "client" ? "CLIENT" : by === "admin" ? "ADMIN" : "PARTNER", actorId, source, action: "lead_cancelled", metadata: { reason } });
  lead.cancelledBy = by;
  lead.cancelReason = clean(reason, 300);
  await lead.save();
  if (by === "client" && ["SENT_TO_PARTNER", "ALTERNATIVE_PROPOSED", "TEST_DRIVE_SCHEDULED"].includes(lead.history.at(-1)?.from)) {
    await notifyPartner(lead, { titre: "❌ Demande d'essai annulée", message: `${lead.reference} — ${lead.client.firstName} a annulé sa demande pour ${lead.listingSnapshot.title}.` });
  }
  return lead;
}

// ── §9 Résultat déclaré par le partenaire ───────────────────────────────────

export async function reportOutcome(lead, { actorId, source = "DASHBOARD", testDrive = null, commercial = null, note = null, newDate = null, newTime = null, lostReason = null } = {}) {
  if (testDrive && !TEST_DRIVE_OUTCOMES.includes(testDrive)) throw new LeadError(400, "Résultat d'essai invalide.");
  if (commercial && !COMMERCIAL_OUTCOMES.includes(commercial)) throw new LeadError(400, "Résultat commercial invalide.");
  if (!testDrive && !commercial) throw new LeadError(400, "Indiquez un résultat.");
  if (commercial === "sold") throw new LeadError(400, "Déclarez la vente avec le prix final (bouton « Vente conclue »).", "USE_DECLARE_SALE");

  const opts = { actorType: "PARTNER", actorId, source };
  lead.outcome.reportedAt = new Date();
  lead.outcome.note = clean(note, 1000);

  if (testDrive === "postponed") {
    const d = combineDateTime(newDate, newTime);
    if (!d) throw new LeadError(400, "Nouvelle date de l'essai requise.");
    lead.appointment.date = d;
    lead.appointment.time = clean(newTime, 5);
    lead.appointment.endAt = new Date(d.getTime() + TEST_DRIVE_DURATION_MS);
    lead.outcome.testDrive = "postponed";
    lead.outcome.requestedAt = null;
    lead.followUp.sentAt = null;
    if (lead.status !== "TEST_DRIVE_SCHEDULED") transition(lead, "TEST_DRIVE_SCHEDULED", { ...opts, action: "test_drive_postponed" });
    else logEvent(lead, "test_drive_postponed", { ...opts, metadata: { date: d } });
    await lead.save();
    await notifyClient(lead, {
      titre:   "📅 Votre essai est reporté",
      message: `${lead.listingSnapshot.title} — nouvelle date : ${fmtDate(d)}${lead.appointment.time ? ` à ${lead.appointment.time}` : ""}.`,
      sms:     `Votre essai ${lead.listingSnapshot.title} est reporté au ${fmtDate(d)}${lead.appointment.time ? ` à ${lead.appointment.time}` : ""}. Détails :`,
    });
    return lead;
  }

  if (testDrive === "no_show") {
    lead.outcome.testDrive = "no_show";
    transition(lead, "CUSTOMER_NO_SHOW", { ...opts, action: "customer_no_show" });
    await lead.save();
    await notifyClient(lead, {
      titre:   "Nous ne vous avons pas vu à l'essai",
      message: `Le vendeur signale que l'essai de ${lead.listingSnapshot.title} n'a pas eu lieu. Souhaitez-vous reprogrammer ? Répondez depuis votre espace.`,
    });
    return lead;
  }

  if (testDrive === "completed") {
    lead.outcome.testDrive = "completed";
    if (lead.status === "TEST_DRIVE_SCHEDULED" || lead.status === "CUSTOMER_NO_SHOW") {
      if (lead.status === "CUSTOMER_NO_SHOW") transition(lead, "TEST_DRIVE_SCHEDULED", { ...opts, action: "test_drive_rescheduled" });
      transition(lead, "TEST_DRIVE_COMPLETED", { ...opts, action: "test_drive_completed" });
    }
  }

  if (commercial) {
    lead.outcome.commercial = commercial;
    const map = { interested: "CUSTOMER_INTERESTED", negotiation: "NEGOTIATION", not_interested: "LOST", sold_elsewhere: "LOST" };
    const target = map[commercial];
    if (target && lead.status !== target) {
      // Un résultat commercial suppose un essai réalisé : on passe par l'étape
      // si le partenaire ne l'a pas déclarée explicitement.
      if (lead.status === "TEST_DRIVE_SCHEDULED" || lead.status === "CUSTOMER_NO_SHOW") {
        if (lead.status === "CUSTOMER_NO_SHOW") transition(lead, "TEST_DRIVE_SCHEDULED", { ...opts, action: "test_drive_rescheduled" });
        lead.outcome.testDrive = lead.outcome.testDrive || "completed";
        transition(lead, "TEST_DRIVE_COMPLETED", { ...opts, action: "test_drive_completed" });
      }
      transition(lead, target, { ...opts, action: `outcome_${commercial}` });
      if (target === "LOST") {
        lead.lostReason = commercial === "sold_elsewhere" ? "Véhicule vendu à un autre client" : (clean(lostReason, 300) || "Client non intéressé");
      }
    } else if (commercial === "other") {
      logEvent(lead, "outcome_other", { ...opts, metadata: { note: lead.outcome.note } });
    }
  }
  await lead.save();
  return lead;
}

// ── §10 Suivi client après l'essai ──────────────────────────────────────────

export async function sendCustomerFollowUp(lead) {
  lead.followUp.sentAt = new Date();
  logEvent(lead, "customer_follow_up_sent", { actorType: "SYSTEM", source: "SYSTEM" });
  await lead.save();
  await notifyClient(lead, {
    titre:    "Comment s'est passé votre essai ?",
    message:  `Nous espérons que votre essai de ${lead.listingSnapshot.title} s'est bien passé. Souhaitez-vous poursuivre votre projet d'achat ? Répondez en un clic depuis votre espace.`,
    sms:      `Votre essai ${lead.listingSnapshot.title} : souhaitez-vous poursuivre votre projet d'achat ? Répondre :`,
    whatsapp: `VIT AUTO — Nous espérons que votre essai de ${lead.listingSnapshot.title} s'est bien passé. Souhaitez-vous poursuivre votre projet d'achat ? Répondre :`,
  });
}

export async function clientFollowUpResponse(lead, { response, actorId = null, source = "PUBLIC_LINK", note = null } = {}) {
  if (!FOLLOW_UP_RESPONSES.includes(response)) throw new LeadError(400, "Réponse invalide.");
  const allowed = ["TEST_DRIVE_SCHEDULED", "TEST_DRIVE_COMPLETED", "CUSTOMER_INTERESTED", "NEGOTIATION", "CUSTOMER_NO_SHOW"];
  if (!allowed.includes(lead.status)) throw new LeadError(409, "Ce dossier n'attend plus de réponse de votre part.");
  const opts = { actorType: "CLIENT", actorId, source };
  lead.followUp.response = response;
  lead.followUp.respondedAt = new Date();
  lead.followUp.remindAt = null;

  const ensureCompleted = () => {
    if (lead.status === "CUSTOMER_NO_SHOW") transition(lead, "TEST_DRIVE_SCHEDULED", { ...opts, action: "test_drive_rescheduled" });
    if (lead.status === "TEST_DRIVE_SCHEDULED") {
      lead.outcome.testDrive = lead.outcome.testDrive || "completed";
      transition(lead, "TEST_DRIVE_COMPLETED", { ...opts, action: "test_drive_completed_by_client" });
    }
  };

  if (response === "interested") {
    ensureCompleted();
    if (lead.status === "TEST_DRIVE_COMPLETED") transition(lead, "CUSTOMER_INTERESTED", { ...opts, action: "customer_interested" });
    else logEvent(lead, "customer_interested", opts);
    await lead.save();
    await notifyPartner(lead, {
      titre:   "🎯 Le client souhaite poursuivre son projet d'achat",
      message: `${lead.reference} — ${lead.client.firstName} (${lead.listingSnapshot.title}) a effectué l'essai et souhaite poursuivre. Contactez-le pour la suite : négociation, offre, financement.`,
      whatsappText: `VIT AUTO — ${lead.client.firstName} souhaite poursuivre son projet d'achat après l'essai de ${lead.listingSnapshot.title} (${lead.reference}). À vous de jouer !`,
    });
  } else if (response === "offer") {
    ensureCompleted();
    if (["TEST_DRIVE_COMPLETED", "CUSTOMER_INTERESTED"].includes(lead.status)) transition(lead, "NEGOTIATION", { ...opts, action: "customer_wants_to_make_offer", metadata: { note: clean(note, 500) } });
    else logEvent(lead, "customer_wants_to_make_offer", { ...opts, metadata: { note: clean(note, 500) } });
    await lead.save();
    await notifyPartner(lead, {
      titre:   "💬 Le client souhaite faire une offre",
      message: `${lead.reference} — ${lead.client.firstName} souhaite faire une offre sur ${lead.listingSnapshot.title}${note ? ` : « ${clean(note, 200)} »` : ""}. Contactez-le pour négocier.`,
    });
  } else if (response === "thinking") {
    ensureCompleted();
    lead.followUp.remindAt = new Date(Date.now() + 7 * 86400000);
    logEvent(lead, "customer_thinking", opts);
    await lead.save();
  } else {
    transition(lead, "LOST", { ...opts, action: "customer_not_interested" });
    lead.lostReason = "Client plus intéressé";
    await lead.save();
    await notifyPartner(lead, { titre: "Client non intéressé", message: `${lead.reference} — ${lead.client.firstName} ne souhaite plus poursuivre pour ${lead.listingSnapshot.title}.` });
  }
  return lead;
}

// ── §12–§14 Vente, commission, attribution ──────────────────────────────────

export async function declareSale(lead, { actorId, source = "DASHBOARD", finalPrice, currency = "USD", soldAt = null, note = null } = {}) {
  const price = Number(finalPrice);
  if (!Number.isFinite(price) || price <= 0) throw new LeadError(400, "Prix de vente final invalide.");
  const cur = String(currency || "USD").toUpperCase().slice(0, 3);
  const date = soldAt ? parseCalendarDate(soldAt) : new Date();
  if (!date || date > new Date(Date.now() + 86400000)) throw new LeadError(400, "Date de vente invalide.");

  const priceUSD = await convertAmount(price, cur, "USD");
  if (priceUSD == null) throw new LeadError(400, `Devise ${cur} inconnue.`);

  const within = !lead.attribution.expiresAt || date <= new Date(lead.attribution.expiresAt);
  // Ligne « vente » de la grille : 5 % standard, 3 % pendant les douze mois
  // Partenaire Fondateur du VENDEUR (grille définitive de l'exploitant).
  const rate = await resolveCommissionRate("vente", lead.partner?._id || lead.partner);
  const amountUSD = within ? Math.round(priceUSD * rate * 100) / 100 : 0;

  transition(lead, "SALE_PENDING", { actorType: "PARTNER", actorId, source, action: "sale_declared", metadata: { finalPrice: price, currency: cur, finalPriceUSD: priceUSD, soldAt: date } });
  lead.sale.finalPrice    = price;
  lead.sale.currency      = cur;
  lead.sale.finalPriceUSD = priceUSD;
  lead.sale.soldAt        = date;
  lead.sale.declaredAt    = new Date();
  lead.sale.declaredBy    = actorId;
  lead.sale.confirmedAt   = null;
  lead.sale.confirmedBy   = null;
  lead.sale.rejectReason  = null;
  lead.outcome.commercial = "sold";
  if (note) lead.outcome.note = clean(note, 1000);
  lead.commission.rate                 = rate;
  lead.commission.amountUSD            = amountUSD;
  lead.commission.dueWithinAttribution = within;
  lead.commission.computedAt           = new Date();
  logEvent(lead, "commission_computed", { actorType: "SYSTEM", source: "SYSTEM", metadata: { rate, amountUSD, dueWithinAttribution: within } });

  // Ligne de commission (suivi dû / versé) — idempotente par lead.
  try {
    const ledger = await CommissionLedger.findOneAndUpdate(
      { transactionId: lead._id.toString(), transactionType: "sale" },
      {
        $set: {
          partnerId: lead.partner, grossAmount: priceUSD, commissionRate: Math.round(rate * 10000) / 100,
          commissionAmount: amountUSD, currency: "USD", type: "platform_fee", status: "pending",
          notes: `Lead ${lead.reference} — ${lead.listingSnapshot.title}${within ? "" : " — hors fenêtre d'attribution"}`,
        },
        $setOnInsert: { transactionId: lead._id.toString(), transactionType: "sale" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    lead.commission.ledgerId = ledger._id;
  } catch (err) {
    logger.error("declareSale — CommissionLedger (non bloquant) :", err.message);
  }
  await lead.save();

  await notifyAdminsLead(lead, "💰 Vente déclarée — à confirmer",
    `${lead.reference} — ${lead.listingSnapshot.title} vendu ${price} ${cur} (≈ ${priceUSD} USD). Commission ${within ? `${amountUSD} USD (${rate * 100} %)` : "hors fenêtre d'attribution"}.`);
  return lead;
}

export async function confirmSale(lead, { actorId, source = "DASHBOARD" } = {}) {
  transition(lead, "SOLD", { actorType: "ADMIN", actorId, source, action: "sale_confirmed" });
  lead.sale.confirmedAt = new Date();
  lead.sale.confirmedBy = actorId;
  await lead.save();
  if (lead.commission?.ledgerId) {
    await CommissionLedger.updateOne({ _id: lead.commission.ledgerId }, { $set: { status: "confirmed", confirmedAt: new Date() } }).catch(nonBloquant("salesLeadService"));
  }
  // Retire le véhicule vendu du catalogue (même geste que markVehicleSoldIfApplicable).
  try {
    const vehicle = await Vehicle.findById(lead.vehicle);
    if (vehicle && vehicle.type === "vente" && vehicle.status !== "sold") {
      vehicle.status = "sold";
      vehicle.available = false;
      vehicle.statusHistory = vehicle.statusHistory || [];
      vehicle.statusHistory.push({ status: "sold", changedAt: new Date(), changedBy: actorId });
      await vehicle.save();
    }
  } catch (err) {
    logger.warn("confirmSale — véhicule (non bloquant) :", err.message);
  }
  await notifyPartner(lead, {
    titre:   "🎉 Vente confirmée",
    message: `${lead.reference} — ${lead.listingSnapshot.title} : vente confirmée par VIT AUTO. Commission : ${lead.commission.amountUSD} USD (${Math.round(lead.commission.rate * 10000) / 100} % du prix final).`,
  });
  await notifyClient(lead, {
    titre:   "🎉 Félicitations pour votre achat",
    message: `Votre projet ${lead.listingSnapshot.title} est conclu. Merci d'avoir choisi VIT AUTO.`,
  });
  return lead;
}

export async function rejectSale(lead, { actorId, source = "DASHBOARD", reason = null } = {}) {
  transition(lead, "NEGOTIATION", { actorType: "ADMIN", actorId, source, action: "sale_rejected", metadata: { reason } });
  lead.sale.rejectReason = clean(reason, 300);
  lead.commission.rate                 = null;
  lead.commission.amountUSD            = null;
  lead.commission.dueWithinAttribution = null;
  lead.commission.computedAt           = null;
  await lead.save();
  if (lead.commission?.ledgerId) {
    await CommissionLedger.updateOne({ _id: lead.commission.ledgerId }, { $set: { status: "cancelled" } }).catch(nonBloquant("salesLeadService"));
  }
  await notifyPartner(lead, { titre: "Vente non confirmée", message: `${lead.reference} — la déclaration de vente n'a pas été confirmée${reason ? ` : ${clean(reason, 200)}` : ""}. Le dossier reste en négociation.` });
  return lead;
}

// ── Intervention admin (§7, §8) ─────────────────────────────────────────────

export async function adminSetStatus(lead, { actorId, status, reason = null, source = "DASHBOARD" } = {}) {
  const wf = getWorkflow(lead.workflow);
  if (!wf.statuses.includes(status)) throw new LeadError(400, "Statut inconnu.");
  if (status === "SOLD") throw new LeadError(400, "Confirmez la vente via la déclaration du partenaire.");
  transition(lead, status, { actorType: "ADMIN", actorId, source, action: "admin_status_override", metadata: { reason }, force: true });
  if (status === "LOST") lead.lostReason = clean(reason, 300) || "Clôturé par VIT AUTO";
  if (status === "CANCELLED") { lead.cancelledBy = "admin"; lead.cancelReason = clean(reason, 300); }
  await lead.save();
  return lead;
}

export async function adminQualify(lead, { actorId, level = null, transmit = true, source = "DASHBOARD" } = {}) {
  if (level && [1, 2, 3].includes(Number(level))) lead.qualification.level = Number(level);
  lead.qualification.qualifiedBy = actorId;
  lead.qualification.qualifiedAt = new Date();
  lead.qualification.autoSendAt = null;
  logEvent(lead, "lead_qualified_by_admin", { actorType: "ADMIN", actorId, source, metadata: { level: lead.qualification.level } });
  if (transmit && ["NEW", "QUALIFYING"].includes(lead.status)) {
    await sendToPartner(lead, { actorType: "ADMIN", actorId, source });
  } else {
    await lead.save();
  }
  return lead;
}

// ── Vue partenaire : coordonnées masquées avant le stade de divulgation ────

export function maskPhone(phone) {
  if (!phone) return null;
  const s = String(phone);
  if (s.length <= 4) return "••••";
  return `${s.slice(0, 4)}${"•".repeat(Math.max(2, s.length - 6))}${s.slice(-2)}`;
}

export function partnerView(leadDoc) {
  const lead = leadDoc.toObject ? leadDoc.toObject() : leadDoc;
  const disclosed = !!lead.contact?.disclosedToPartnerAt;
  const client = disclosed
    ? { firstName: lead.client.firstName, lastName: lead.client.lastName, phone: lead.client.phone, whatsapp: lead.client.whatsapp, email: lead.client.email, city: lead.client.city, country: lead.client.country }
    : { firstName: lead.client.firstName, lastName: lead.client.lastName ? `${lead.client.lastName.charAt(0)}.` : "", phone: maskPhone(lead.client.phone), whatsapp: null, email: null, city: lead.client.city, country: lead.client.country };
  const { clientAccessToken, internalNotes, assignedAdmin, ...rest } = lead;
  return { ...rest, client, contactDisclosed: disclosed, statusLabel: SALE_LEAD_LABELS[lead.status] };
}

export function clientView(leadDoc) {
  const lead = leadDoc.toObject ? leadDoc.toObject() : leadDoc;
  const { clientAccessToken, internalNotes, partnerNotes, assignedAdmin, commission, sla, qualification, history, ...rest } = lead;
  return {
    ...rest,
    statusLabel: SALE_LEAD_LABELS[lead.status],
    history: (history || []).filter((h) => !["lead_qualified", "qualification_required", "lead_qualified_by_admin", "commission_computed", "contact_disclosed"].includes(h.action))
      .map(({ action, timestamp, from, to }) => ({ action, timestamp, from, to })),
  };
}

export function adminView(leadDoc) {
  const lead = leadDoc.toObject ? leadDoc.toObject() : leadDoc;
  const { clientAccessToken, ...rest } = lead;
  return { ...rest, statusLabel: SALE_LEAD_LABELS[lead.status] };
}
