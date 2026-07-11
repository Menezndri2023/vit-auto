// true si un provider SMS réel (Africa's Talking ou Twilio) est configuré.
// Centralisé ici (plutôt que dupliqué) car consommé à la fois par authController.js
// (gate login/OTP) et par le worker OCR (score/auto-approbation KYC) — sans provider
// réel, aucune vérification téléphone n'est possible et ne doit donc jamais bloquer
// un utilisateur ni conditionner une auto-approbation.
export const smsConfigured = () =>
  !!(process.env.AT_USERNAME && process.env.AT_API_KEY &&
     process.env.AT_API_KEY !== "atsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") ||
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM);
