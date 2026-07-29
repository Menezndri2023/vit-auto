import { Webhook } from "svix";
import CommunicationLog from "../models/CommunicationLog.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import logger from "../utils/logger.js";
import { captureException } from "../config/sentry.js";

// ── Webhook Resend (bounce/complaint/delivered) ───────────────────────────────
// Bug/manque réel corrigé (audit) : aucun webhook n'existait jusqu'ici — un
// email accepté par Resend au moment de l'envoi (CommunicationLog.status =
// "sent") pouvait ensuite bouncer de façon totalement asynchrone (boîte
// pleine, domaine expéditeur non vérifié côté Resend, adresse invalide...)
// sans que la plateforme n'en soit jamais informée. "delivered" n'était
// positionné QUE par l'ouverture du pixel de tracking (voir
// CommunicationAnalytics.trackOpen) — un email jamais ouvert restait
// indiscernable d'un email jamais livré. Ce webhook comble cet angle mort.
//
// À activer : créer un endpoint webhook dans le dashboard Resend
// (https://resend.com/webhooks) pointant vers
// {APP_URL}/api/comm/webhook/resend, cocher au minimum email.delivered,
// email.bounced, email.complained, email.delivery_delayed — puis copier le
// "Signing Secret" fourni dans RESEND_WEBHOOK_SECRET (.env). Sans cette
// variable, le webhook refuse toute requête (503) plutôt que d'accepter des
// données non authentifiées.
const notifyAdmins = async (type, titre, message, lien) => {
  const admins = await User.find({ role: "admin" }).select("_id");
  if (!admins.length) return;
  const docs = await Notification.insertMany(admins.map((a) => ({ user: a._id, type, titre, message, lien })));
  if (global._io) {
    for (const doc of docs) {
      global._io.to(`user_${doc.user}`).emit("notification_new", {
        _id: doc._id, type, titre, message, lien, lu: false, createdAt: doc.createdAt,
      });
    }
  }
};

// Templates dont la non-livraison mérite une alerte admin immédiate (documents
// légaux/financiers) — un bounce sur un simple email de vérification/
// confirmation n'a pas besoin de réveiller un admin.
const CRITICAL_TEMPLATES = new Set([
  "loi_ready", "agreement_ready", "loi_signed", "agreement_signed",
  "documents_ready_reminder", "contract_ready", "contract_signed",
  "welcome_partner", "invoice",
]);

export const resendWebhook = async (req, res) => {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      logger.warn("[resendWebhook] RESEND_WEBHOOK_SECRET manquant — webhook refusé. Voir commWebhookController.js pour la configuration.");
      return res.status(503).json({ message: "Webhook non configuré." });
    }

    const wh = new Webhook(secret);
    const payload = req.body; // Buffer brut (express.raw, monté avant express.json() — voir server.js)
    const event = wh.verify(payload, {
      "svix-id":        req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });

    const { type, data } = event;
    const messageId = data?.email_id;
    if (!messageId) return res.json({ received: true });

    if (type === "email.delivered") {
      await CommunicationLog.updateOne(
        { messageId },
        { $set: { status: "delivered", deliveredAt: new Date() } }
      );
    } else if (type === "email.bounced" || type === "email.complained") {
      const status = type === "email.bounced" ? "bounced" : "complained";
      const reason = data?.bounce?.message || data?.complaint?.type || type;
      const log = await CommunicationLog.findOneAndUpdate(
        { messageId },
        { $set: { status, bouncedAt: new Date(), errorMessage: `Resend ${type} : ${reason}` } },
        { new: true }
      );
      logger.error("[resendWebhook] Email non livré", { messageId, type, to: log?.to, template: log?.template, reason });

      if (log?.template && CRITICAL_TEMPLATES.has(log.template)) {
        await notifyAdmins(
          "email_bounce",
          "📧 Email critique non livré",
          `"${log.template}" → ${log.to} n'a pas pu être délivré (${status === "bounced" ? "rejeté" : "signalé comme spam"}). ${reason}`.slice(0, 300),
          "/admin"
        ).catch((e) => logger.error("[resendWebhook] notifyAdmins:", e.message));
      }
    } else if (type === "email.delivery_delayed") {
      await CommunicationLog.updateOne({ messageId, status: { $ne: "delivered" } }, { $set: { status: "sent" } });
    }

    res.json({ received: true });
  } catch (err) {
    logger.error("resendWebhook:", err.message);
    captureException(err, { controller: "commWebhookController.resendWebhook" });
    res.status(400).json({ message: "Webhook invalide." });
  }
};
