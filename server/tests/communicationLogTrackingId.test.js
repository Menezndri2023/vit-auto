import { describe, it, expect } from "vitest";
import CommunicationLog from "../models/CommunicationLog.js";
import { logSend } from "../services/communication/analytics/CommunicationAnalytics.js";

// Bug réel trouvé en vérification locale du parcours « demande d'essai »
// (2026-09-12) : l'index unique `sparse` sur trackingId n'ignore que le champ
// ABSENT ; `trackingId: null` explicite était indexé, et dès le deuxième
// SMS/WhatsApp/push (sans trackingId, réservé à l'e-mail) la journalisation
// échouait en E11000 — avalée par le catch, donc invisible.
describe("CommunicationLog — journalisation sans trackingId", () => {
  it("journalise plusieurs envois SMS sans trackingId (pas de collision sur null)", async () => {
    await CommunicationLog.syncIndexes();
    await logSend({ to: "+2250700000001", channel: "sms", template: "generic", provider: "console", status: "sent" });
    await logSend({ to: "+2250700000002", channel: "sms", template: "generic", provider: "console", status: "sent" });
    await logSend({ to: "+2250700000003", channel: "whatsapp", template: "text", provider: "whatsapp_api", status: "sent" });
    expect(await CommunicationLog.countDocuments({ channel: { $in: ["sms", "whatsapp"] } })).toBe(3);
  });

  it("refuse toujours deux e-mails portant le même trackingId", async () => {
    await CommunicationLog.syncIndexes();
    await logSend({ to: "a@x.test", channel: "email", template: "generic_notification", provider: "console", status: "sent", trackingId: "abc-123" });
    await logSend({ to: "b@x.test", channel: "email", template: "generic_notification", provider: "console", status: "sent", trackingId: "abc-123" });
    expect(await CommunicationLog.countDocuments({ trackingId: "abc-123" })).toBe(1);
  });
});
