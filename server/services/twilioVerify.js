/**
 * VIT AUTO — Twilio Verify
 *
 * Twilio Verify est un service d'OTP entièrement géré : Twilio génère, stocke,
 * expire et vérifie lui-même le code — on ne génère/hashe plus notre propre OTP
 * pour ce provider (contrairement au flux Africa's Talking conservé dans
 * authController.js pour compatibilité).
 */
import logger from "../utils/logger.js";

let _client = null;
async function getClient() {
  if (_client) return _client;
  const { default: twilio } = await import("twilio");
  _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

// ── Envoyer un code de vérification ───────────────────────────────────────────
export async function sendVerification(phoneNumber) {
  try {
    const twilioClient = await getClient();
    const verification = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: phoneNumber,
        channel: process.env.TWILIO_VERIFY_CHANNEL || "sms",
      });
    logger.info("[TwilioVerify] Code envoyé", { phoneNumber, status: verification.status });
    return { sent: true, status: verification.status, provider: "twilio_verify" };
  } catch (err) {
    logger.error("[TwilioVerify] Erreur envoi:", err.message);
    return { sent: false, error: err.message, provider: "twilio_verify" };
  }
}

// ── Vérifier le code saisi par l'utilisateur ──────────────────────────────────
export async function checkVerification(phoneNumber, code) {
  try {
    const twilioClient = await getClient();
    const check = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code });
    return { valid: check.status === "approved", status: check.status };
  } catch (err) {
    // Twilio renvoie une 404 si le code/tentative n'existe plus (expiré ou déjà
    // consommé) — traiter comme "code invalide" plutôt que comme une erreur serveur.
    logger.warn("[TwilioVerify] Vérification refusée:", err.message);
    return { valid: false, status: "failed", error: err.message };
  }
}
