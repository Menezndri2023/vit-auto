/**
 * VIT AUTO — Communication Engine
 *
 * Module central de communication multi-canal.
 * Usage:
 *   import comm from "../services/communication/index.js";
 *   await comm.email({ to, template: "booking_confirmation", data: { ... }, subject: "..." });
 *   await comm.sms({ to: "+2250700000000", template: "otp_verification", data: { code: "123456" } });
 *   await comm.notify({ userId, type: "booking", titre: "...", message: "..." });
 */
export {
  send,
  sendMulti,
  sendViaEmail    as email,
  sendViaSms      as sms,
  sendViaWhatsApp as whatsapp,
  sendViaPush     as push,
  sendViaInternal as notify,
  broadcast,
  buildTrackedUrl,
  buildTrackingPixel,
  EMAIL_TEMPLATES,
} from "./CommunicationService.js";

export { getStats, getTopTemplates, trackOpen, trackClick, logSend } from "./analytics/CommunicationAnalytics.js";
export { sendInternal, sendInternalBroadcast } from "./channels/InternalChannel.js";
export { initCommunicationQueues, areQueuesReady, enqueueMessage, scheduleMessage, getQueueStats } from "./queue/CommunicationQueue.js";

// Templates pour usage direct si besoin
export * from "./templates/email/Verification.js";
export * from "./templates/email/Booking.js";
export * from "./templates/email/WelcomePartner.js";
export * from "./templates/email/LOI.js";
export * from "./templates/email/Reservation.js";
export * from "./templates/email/Invoice.js";
export * from "./templates/email/Contract.js";
export * from "./templates/email/KYC.js";
