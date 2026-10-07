// Interrupteur global des SMS, posé dans Render : SMS_ENABLED=true.
// Éteint par défaut. Historique : coupé en dur après l'incident du 2026-07-13
// (compte Twilio Verify en mode Trial, codes non délivrés, utilisateurs
// bloqués). Depuis le 2026-10-07 l'exploitant a un compte Twilio payant ; il
// rallume les SMS lui-même après avoir posé les identifiants. Tant qu'il est
// éteint, smsConfigured()/twilioVerifyConfigured() renvoient false quels que
// soient les identifiants présents, et aucun SMS (code ou notification) ne part.
export const smsActif = () => process.env.SMS_ENABLED === "true";

// true si un provider SMS réel (Africa's Talking ou Twilio Verify) est configuré.
// Centralisé ici (plutôt que dupliqué) car consommé à la fois par authController.js
// (gate login/OTP) et par le worker OCR (score/auto-approbation KYC) — sans provider
// réel, aucune vérification téléphone n'est possible et ne doit donc jamais bloquer
// un utilisateur ni conditionner une auto-approbation.
export const smsConfigured = () =>
  smsActif() &&
  (!!(process.env.AT_USERNAME && process.env.AT_API_KEY &&
     process.env.AT_API_KEY !== "atsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") ||
   !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID));

// true si Twilio Verify spécifiquement est configuré (utilisé pour choisir entre
// le flux OTP géré par Twilio Verify et l'ancien flux OTP maison Africa's Talking).
export const twilioVerifyConfigured = () =>
  smsActif() &&
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
