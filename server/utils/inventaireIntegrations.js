// Inventaire des intégrations (2026-10-07) — affiché aux administrateurs dans
// /api/health (onglet « Santé système »). Ne renvoie JAMAIS de valeur : seulement
// « configuré », « incomplet » ou « absent », et les noms des variables manquantes.
// Chaque intégration : les variables qu'elle exige. Présente = non vide.
// Valeur recopiée d'un .env.example : comptée comme manquante.
const VALEUR_EXEMPLE = /^(your[_-]|changeme|change_me|placeholder|todo|<)|x{6,}/i;

export function inventaireIntegrations(env) {
  const groupes = {
    "Base de données (MongoDB)":       ["MONGO_URI"],
    "Sessions (JWT)":                  ["JWT_SECRET", "REFRESH_TOKEN_SECRET"],
    "Chiffrement KYC":                 ["FIELD_ENCRYPTION_KEY"],
    "Cache et files (Redis)":          ["REDIS_URL"],
    "E-mails (Resend)":                ["RESEND_API_KEY", "EMAIL_FROM"],
    "Suivi des e-mails (webhook Resend)": ["RESEND_WEBHOOK_SECRET"],
    "Alertes e-mail admin":            ["ADMIN_ALERT_EMAIL"],
    "Images et documents (ImageKit)":  ["IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY", "IMAGEKIT_URL_ENDPOINT"],
    "Connexion Google":                ["GOOGLE_OAUTH_CLIENT_ID"],
    "Notifications push (Firebase)":   ["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_JSON"],
    "Suivi des erreurs (Sentry)":      ["SENTRY_DSN"],
    "SMS — interrupteur (SMS_ENABLED=true)": ["SMS_ENABLED"],
    "SMS et codes (Twilio Verify)":    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"],
    "SMS Afrique (Africa's Talking)":  ["AT_USERNAME", "AT_API_KEY"],
    "WhatsApp — envoi (Meta)":         ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID"],
    "WhatsApp — webhook (Meta)":       ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"],
    "Bot WhatsApp — IA (Anthropic)":   ["ANTHROPIC_API_KEY"],
    "Paiements — interrupteur":        ["PAYMENTS_ENABLED"],
    "Paiement PayDunya (carte + mobile money)": ["PAYDUNYA_MASTER_KEY", "PAYDUNYA_PRIVATE_KEY", "PAYDUNYA_TOKEN", "PAYDUNYA_MODE"],
    "Paiement carte (Stripe)":         ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    "Paiement Orange Money":           ["ORANGE_MONEY_CLIENT_ID", "ORANGE_MONEY_CLIENT_SECRET", "ORANGE_MONEY_MERCHANT_KEY"],
    "Paiement Wave":                   ["WAVE_API_KEY", "WAVE_WEBHOOK_SECRET"],
  };
  const out = {};
  for (const [nom, vars] of Object.entries(groupes)) {
    const manquantes = vars.filter((v) => {
      const val = String(env[v] || "").trim();
      // Un interrupteur (…_ENABLED) n'est « configuré » que s'il vaut true.
      if (/_ENABLED$/.test(v)) return val !== "true";
      return !val || VALEUR_EXEMPLE.test(val);
    });
    out[nom] = { etat: manquantes.length === 0 ? "configuré" : manquantes.length === vars.length ? "absent" : "incomplet", manquantes };
  }
  return out;
}

