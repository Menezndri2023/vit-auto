// ── Notifications du parcours « demande d'essai » ───────────────────────────
//
// Trois destinataires, trois situations :
//  - partenaire : compte obligatoire → notify() (in-app + push + filet e-mail
//    automatique via le hook Notification), plus un WhatsApp texte s'il est
//    configuré — silencieux sinon (WhatsAppChannel gère déjà ce cas).
//  - client : compte facultatif. Connecté → notify(). Invité → e-mail
//    (generic_notification), SMS (generic) et WhatsApp texte, chacun ignoré
//    en silence si le canal n'est pas configuré. Le lien porte le jeton
//    d'accès public (voir SalesLead.clientAccessToken).
//  - admins : notifyAdmins() (in-app + copie e-mail automatique).
//
// Aucune nouvelle mécanique d'envoi : uniquement les files et le helper
// déjà en place (queue/index.js, bookingController.notify, utils/notifyAdmins).
import User from "../models/User.js";
import logger from "../utils/logger.js";
import { enqueue } from "../queue/index.js";
import { QUEUE_NAMES } from "../queue/definitions.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";

async function getNotify() {
  return (await import("../controllers/bookingController.js")).notify;
}

function appUrl() {
  return (process.env.APP_URL || "https://vit-auto.com").replace(/\/$/, "");
}

// Lien de suivi côté client : la page publique /essai/:reference, avec le
// jeton uniquement pour un invité (un client connecté y accède par sa session).
export function clientLeadPath(lead) {
  const base = `/essai/${lead.reference}`;
  return lead.client?.userId ? base : `${base}?t=${lead.clientAccessToken}`;
}

export async function notifyPartner(lead, { titre, message, whatsappText = null }) {
  const partnerId = lead.partner?._id || lead.partner;
  if (!partnerId) return;
  try {
    const notify = await getNotify();
    await notify(partnerId, "sales_lead", titre, message, "/vendor/dashboard?tab=opportunites");
  } catch (err) {
    logger.warn("[SalesLeadNotifier] partenaire (non bloquant) :", err?.message);
  }
  if (whatsappText) {
    try {
      const owner = await User.findById(partnerId).select("phone").lean();
      if (owner?.phone) {
        await enqueue(QUEUE_NAMES.WHATSAPP, "sales_lead_partner_wa", {
          to: owner.phone, text: whatsappText, userId: partnerId.toString(),
        });
      }
    } catch (err) {
      logger.warn("[SalesLeadNotifier] WhatsApp partenaire (non bloquant) :", err?.message);
    }
  }
}

export async function notifyClient(lead, { titre, message, sms = null, whatsapp = null }) {
  const lien = clientLeadPath(lead);
  const link = `${appUrl()}${lien}`;
  try {
    if (lead.client?.userId) {
      const notify = await getNotify();
      await notify(lead.client.userId, "sales_lead", titre, message, lien);
    } else if (lead.client?.email) {
      await enqueue(QUEUE_NAMES.EMAIL, "sales_lead_client_email", {
        type:   "generic_notification",
        to:     lead.client.email,
        data:   { firstName: lead.client.firstName, titre, message, lien },
      });
    }
  } catch (err) {
    logger.warn("[SalesLeadNotifier] client (non bloquant) :", err?.message);
  }

  // SMS/WhatsApp : courts, avec le lien — invités comme connectés (un
  // rendez-vous confirmé mérite d'atteindre le téléphone, pas seulement la
  // cloche in-app).
  const phone = lead.client?.phone;
  const wa    = lead.client?.whatsapp || phone;
  try {
    if (whatsapp && wa) {
      await enqueue(QUEUE_NAMES.WHATSAPP, "sales_lead_client_wa", { to: wa, text: `${whatsapp}\n${link}` });
    }
    if (sms && phone) {
      await enqueue(QUEUE_NAMES.SMS, "sales_lead_client_sms", { type: "generic", to: phone, data: { message: `${sms} ${link}` } });
    }
  } catch (err) {
    logger.warn("[SalesLeadNotifier] SMS/WhatsApp client (non bloquant) :", err?.message);
  }
}

export async function notifyAdminsLead(lead, titre, message) {
  try {
    await notifyAdmins("sales_lead", titre, message, `/admin?tab=sales_leads&lead=${lead._id}`);
  } catch (err) {
    logger.warn("[SalesLeadNotifier] admins (non bloquant) :", err?.message);
  }
}
