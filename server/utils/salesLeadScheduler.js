/**
 * VIT AUTO — Planificateur du parcours « demande d'essai »
 *
 * Même pattern que partnerResponseReminders.js : volontairement PAS un job
 * BullMQ (quota Redis Upstash sous tension) — un setInterval en mémoire, scan
 * toutes les 5 min. Quatre responsabilités (docs/vente-demande-essai.md) :
 *   §7  délai de réponse partenaire : rappel → rappel renforcé → intervention VIT AUTO
 *   §3  niveau 2 non traité par un admin : transmission automatique
 *   §9  après la date d'essai : demander le résultat au partenaire
 *   §10 après l'essai : message de suivi au client (+ relance « je réfléchis »)
 * Chaque envoi est idempotent grâce aux horodatages écrits sur le lead.
 */
import logger from "./logger.js";
import SalesLead from "../models/SalesLead.js";
import {
  getSalesLeadConfig, sendToPartner, sendCustomerFollowUp, logEvent,
} from "../services/salesLeadService.js";
import { notifyPartner, notifyAdminsLead } from "../services/salesLeadNotifier.js";

const min = (n) => n * 60 * 1000;

export async function runSalesLeadScheduler(now = new Date()) {
  const stats = { reminded1: 0, reminded2: 0, escalated: 0, autoSent: 0, outcomeAsked: 0, outcomeReminded: 0, outcomeAlerted: 0, followUps: 0, thinkingReminders: 0 };
  let cfg;
  try { cfg = await getSalesLeadConfig(); } catch (err) { logger.error("salesLeadScheduler config:", err); return stats; }

  // ── §7 Délai de réponse partenaire ────────────────────────────────────────
  try {
    const waiting = await SalesLead.find({
      status: "SENT_TO_PARTNER",
      "milestones.sentToPartnerAt": { $ne: null, $lte: new Date(now.getTime() - min(cfg.responseSlaMinutes)) },
    });
    for (const lead of waiting) {
      const sentAt = new Date(lead.milestones.sentToPartnerAt).getTime();
      const age = now.getTime() - sentAt;
      const title = lead.listingSnapshot?.title || "véhicule";

      // Une étape par cycle, dans l'ordre : rappel → rappel renforcé → intervention.
      if (!lead.sla.reminder1SentAt) {
        lead.sla.reminder1SentAt = now;
        logEvent(lead, "partner_reminder_1", { actorType: "SYSTEM", source: "SYSTEM" });
        await lead.save();
        await notifyPartner(lead, {
          titre:   "⏰ Rappel — demande d'essai en attente",
          message: `${lead.reference} — ${title} : ${lead.client.firstName} attend votre réponse. Un client répondu vite est un client qui vient.`,
        });
        stats.reminded1 += 1;
      } else if (age >= min(cfg.escalationMinutes) && !lead.sla.reminder2SentAt) {
        lead.sla.reminder2SentAt = now;
        logEvent(lead, "partner_reminder_2", { actorType: "SYSTEM", source: "SYSTEM" });
        await lead.save();
        await notifyPartner(lead, {
          titre:   "⏰ Demande d'essai toujours sans réponse",
          message: `${lead.reference} — ${title} : ${lead.client.firstName} attend votre réponse depuis ${Math.round(age / 3600000)} h. Sans action, VIT AUTO prendra le relais.`,
          whatsappText: `VIT AUTO — Rappel : la demande d'essai ${lead.reference} (${title}) attend votre réponse depuis ${Math.round(age / 3600000)} h. Acceptez, proposez un autre créneau ou refusez depuis votre tableau de bord.`,
        });
        stats.reminded2 += 1;
      } else if (age >= min(cfg.adminInterventionMinutes) && !lead.sla.escalatedAt) {
        lead.sla.escalatedAt = now;
        logEvent(lead, "partner_response_escalated", { actorType: "SYSTEM", source: "SYSTEM" });
        await lead.save();
        await notifyAdminsLead(lead, "🚨 Demande d'essai sans réponse partenaire",
          `${lead.reference} — ${title} : aucune réponse du partenaire depuis ${Math.round(age / 3600000)} h. Intervention VIT AUTO recommandée.`);
        stats.escalated += 1;
      }
    }
  } catch (err) { logger.error("salesLeadScheduler SLA:", err); }

  // ── §3 Niveau 2 : transmission automatique sans action admin ─────────────
  try {
    const due = await SalesLead.find({ status: "QUALIFYING", "qualification.level": 2, "qualification.autoSendAt": { $ne: null, $lte: now } });
    for (const lead of due) {
      lead.qualification.autoSendAt = null;
      await sendToPartner(lead, { actorType: "SYSTEM", source: "SYSTEM" });
      stats.autoSent += 1;
    }
  } catch (err) { logger.error("salesLeadScheduler autoSend:", err); }

  // ── §9 Après la date d'essai : résultat demandé au partenaire ────────────
  try {
    const past = await SalesLead.find({
      status: "TEST_DRIVE_SCHEDULED",
      "appointment.endAt": { $ne: null, $lte: new Date(now.getTime() - min(60)) },
      "outcome.reportedAt": null,
    });
    for (const lead of past) {
      const title = lead.listingSnapshot?.title || "véhicule";
      const since = lead.outcome.requestedAt ? now.getTime() - new Date(lead.outcome.requestedAt).getTime() : 0;
      if (!lead.outcome.requestedAt) {
        lead.outcome.requestedAt = now;
        logEvent(lead, "outcome_requested", { actorType: "SYSTEM", source: "SYSTEM" });
        await lead.save();
        await notifyPartner(lead, {
          titre:   "❓ Quel est le résultat de cette demande ?",
          message: `${lead.reference} — ${title} avec ${lead.client.firstName} : essai réalisé, client absent, reporté, intéressé, négociation, vente conclue… Mettez à jour le dossier en un clic.`,
          whatsappText: `VIT AUTO — L'essai ${lead.reference} (${title}) était prévu. Quel est le résultat ? Mettez à jour le dossier depuis votre tableau de bord.`,
        });
        stats.outcomeAsked += 1;
      } else if (since >= min(24 * 60) && !lead.outcome.reminderSentAt) {
        lead.outcome.reminderSentAt = now;
        await lead.save();
        await notifyPartner(lead, { titre: "❓ Rappel — résultat de l'essai", message: `${lead.reference} — ${title} : indiquez le résultat de l'essai avec ${lead.client.firstName}.` });
        stats.outcomeReminded += 1;
      } else if (since >= min(48 * 60) && !lead.outcome.adminAlertedAt) {
        lead.outcome.adminAlertedAt = now;
        await lead.save();
        await notifyAdminsLead(lead, "⚠️ Résultat d'essai non renseigné", `${lead.reference} — ${title} : le partenaire n'a pas renseigné le résultat 48 h après l'essai.`);
        stats.outcomeAlerted += 1;
      }
    }
  } catch (err) { logger.error("salesLeadScheduler outcome:", err); }

  // ── §10 Suivi client après l'essai (+3 h), et relance « je réfléchis » ───
  try {
    const due = await SalesLead.find({
      $or: [
        { status: "TEST_DRIVE_SCHEDULED", "appointment.endAt": { $ne: null, $lte: new Date(now.getTime() - min(180)) }, "followUp.sentAt": null },
        { status: { $in: ["TEST_DRIVE_COMPLETED", "CUSTOMER_INTERESTED", "NEGOTIATION"] }, "followUp.sentAt": null },
        { status: { $in: ["TEST_DRIVE_COMPLETED", "CUSTOMER_INTERESTED"] }, "followUp.remindAt": { $ne: null, $lte: now } },
      ],
    });
    for (const lead of due) {
      const isReminder = !!lead.followUp.remindAt;
      lead.followUp.remindAt = null;
      await sendCustomerFollowUp(lead);
      if (isReminder) stats.thinkingReminders += 1; else stats.followUps += 1;
    }
  } catch (err) { logger.error("salesLeadScheduler followUp:", err); }

  if (Object.values(stats).some(Boolean)) logger.info("[SalesLeadScheduler] Cycle terminé", stats);
  return stats;
}

let _interval = null;
export function startSalesLeadScheduler() {
  if (_interval) return;
  setTimeout(() => runSalesLeadScheduler().catch(() => {}), 3 * 60 * 1000);
  _interval = setInterval(() => runSalesLeadScheduler().catch(() => {}), 5 * 60 * 1000);
}
