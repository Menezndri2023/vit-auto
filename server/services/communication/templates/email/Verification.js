import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox } from "../shared/components.js";

export function emailVerificationTemplate({ firstName, verifyUrl }, trackingPixel = "") {
  const body = `
    ${heroSection("Vérifiez votre adresse e-mail", "Une étape rapide pour activer votre compte", "✉️")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Merci de vous être inscrit sur <strong>VIT AUTO</strong> — la plateforme internationale de commerce automobile.
      Cliquez sur le bouton ci-dessous pour activer votre compte.
    </p>
    ${btn("Vérifier mon adresse e-mail", verifyUrl, "primary")}
    ${infoBox(`
      <strong>Ce lien expire dans 24 heures.</strong><br>
      Si vous n'avez pas créé de compte VIT AUTO, ignorez cet e-mail.
    `, "neutral")}
    <p style="font-size:13px;color:${BRAND.muted};margin:16px 0 0">
      Ou copiez ce lien dans votre navigateur :<br>
      <span style="color:${BRAND.accent};word-break:break-all;font-size:12px">${verifyUrl}</span>
    </p>
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({ title: "Vérification e-mail", preheader: "Activez votre compte VIT AUTO en un clic", body });
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
