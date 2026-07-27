import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox } from "../shared/components.js";

// `code` (6 chiffres) est désormais le moyen principal de confirmation — saisi
// directement dans le parcours d'inscription (voir Register.jsx), il rend la
// vérification bloquante avant de pouvoir continuer, contrairement au lien
// ci-dessous qui reste ignorable indéfiniment. Le lien est conservé en repli
// (utile si l'email est ouvert sur un autre appareil que celui de l'inscription).
export function emailVerificationTemplate({ firstName, verifyUrl, code }, trackingPixel = "") {
  const body = `
    ${heroSection("Vérifiez votre adresse e-mail", "Une étape rapide pour activer votre compte", "✉️")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Merci de vous être inscrit sur <strong>VIT AUTO</strong> — la plateforme internationale de commerce automobile.
      Saisissez le code ci-dessous dans la page d'inscription pour activer votre compte.
    </p>
    ${code ? `
    <div style="text-align:center;margin:24px 0">
      <div style="display:inline-block;background:${BRAND.surface || "#f8fafc"};border:2px dashed ${BRAND.accent};border-radius:12px;padding:16px 32px;font-size:32px;font-weight:800;letter-spacing:8px;color:${BRAND.primary}">${code}</div>
    </div>
    ` : ""}
    ${infoBox(`
      <strong>Ce code expire dans 10 minutes.</strong><br>
      Si vous n'avez pas créé de compte VIT AUTO, ignorez cet e-mail.
    `, "neutral")}
    <p style="font-size:13px;color:${BRAND.muted};margin:16px 0 0">
      Vous pouvez aussi cliquer directement sur ce lien :<br>
      <span style="color:${BRAND.accent};word-break:break-all;font-size:12px">${verifyUrl}</span>
    </p>
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({ title: "Vérification e-mail", preheader: "Votre code de confirmation VIT AUTO", body });
}

export function emailChangeConfirmationTemplate({ firstName, newEmail, confirmUrl }, trackingPixel = "") {
  const body = `
    ${heroSection("Confirmez votre nouvelle adresse e-mail", "Une dernière étape avant le changement", "📧")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Vous avez demandé à changer l'adresse e-mail de votre compte <strong>VIT AUTO</strong> pour
      <strong>${newEmail}</strong>. Cliquez ci-dessous pour confirmer — votre ancienne adresse restera
      active tant que vous n'aurez pas confirmé.
    </p>
    ${btn("Confirmer ma nouvelle adresse", confirmUrl, "primary")}
    ${infoBox(`
      <strong>Ce lien expire dans 24 heures.</strong><br>
      Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — votre adresse actuelle ne changera pas.
    `, "neutral")}
    <p style="font-size:13px;color:${BRAND.muted};margin:16px 0 0">
      Ou copiez ce lien dans votre navigateur :<br>
      <span style="color:${BRAND.accent};word-break:break-all;font-size:12px">${confirmUrl}</span>
    </p>
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({ title: "Confirmez votre nouvelle adresse e-mail", preheader: `Confirmez le changement vers ${newEmail}`, body });
}

export function passwordResetTemplate({ firstName, resetUrl }, trackingPixel = "") {
  const body = `
    ${heroSection("Réinitialisez votre mot de passe", "Vous avez demandé une réinitialisation", "🔒")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte VIT AUTO.
      Cliquez ci-dessous pour créer un nouveau mot de passe.
    </p>
    ${btn("Réinitialiser mon mot de passe", resetUrl, "dark")}
    ${infoBox(`
      <strong>⏱ Ce lien est valable 1 heure.</strong><br>
      Si vous n'avez pas fait cette demande, votre compte est sécurisé — ignorez cet e-mail.
    `, "warning")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({ title: "Réinitialisation mot de passe", preheader: "Réinitialisez votre mot de passe VIT AUTO", body });
}
