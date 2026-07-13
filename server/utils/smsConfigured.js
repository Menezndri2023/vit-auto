// Coupe-circuit global : la vérification SMS est désactivée volontairement en
// production (incident 2026-07-13 — le compte Twilio Verify, en mode Trial, ne
// délivrait pas les codes de façon fiable, ce qui bloquait des utilisateurs en
// connexion sans aucun moyen de recevoir leur code). Tant que ce flag est à false,
// smsConfigured()/twilioVerifyConfigured() renvoient toujours false, quels que
// soient les identifiants Twilio/Africa's Talking présents dans les variables
// d'environnement — ce qui neutralise d'un seul coup tous les points d'appel
// (login, inscription, mot de passe oublié, scoring KYC). Repasser à true une
// fois un provider SMS de production fiable (compte payant) mis en place.
const SMS_ENABLED = false;

// true si un provider SMS réel (Africa's Talking ou Twilio Verify) est configuré.
// Centralisé ici (plutôt que dupliqué) car consommé à la fois par authController.js
// (gate login/OTP) et par le worker OCR (score/auto-approbation KYC) — sans provider
// réel, aucune vérification téléphone n'est possible et ne doit donc jamais bloquer
// un utilisateur ni conditionner une auto-approbation.
export const smsConfigured = () =>
  SMS_ENABLED &&
  (!!(process.env.AT_USERNAME && process.env.AT_API_KEY &&
     process.env.AT_API_KEY !== "atsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") ||
   !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID));

// true si Twilio Verify spécifiquement est configuré (utilisé pour choisir entre
// le flux OTP géré par Twilio Verify et l'ancien flux OTP maison Africa's Talking).
export const twilioVerifyConfigured = () =>
  SMS_ENABLED &&
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
