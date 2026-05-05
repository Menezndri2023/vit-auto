import nodemailer from "nodemailer";

// Transporter intelligent : SMTP si configuré, sinon log console (dev)
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }

  // Fallback console — aucun vrai email envoyé, le lien s'affiche dans le terminal
  return {
    sendMail: async (opts) => {
      console.log("\n──────────────────────────────────────────────");
      console.log("📧 [EMAIL SIMULÉ - configurer SMTP dans .env]");
      console.log(`   À       : ${opts.to}`);
      console.log(`   Sujet   : ${opts.subject}`);
      // Extraire et afficher le lien de vérification
      const link = opts.html?.match(/href="([^"]+)"/)?.[1] || "";
      if (link) console.log(`   Lien    : ${link}`);
      console.log("──────────────────────────────────────────────\n");
      return { messageId: "console-" + Date.now() };
    },
  };
}

export const transporter = createTransporter();

export const FROM_ADDRESS =
  process.env.SMTP_FROM || "VIT AUTO <noreply@vitauto.com>";

// Templates HTML
export function emailVerificationTemplate(firstName, verifyUrl) {
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:0;margin:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#0f1b3f,#1e40af);padding:32px 24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:1.6rem">🚗 VIT AUTO</h1>
    <p style="color:rgba(255,255,255,.8);margin:6px 0 0">Vérification de votre adresse e-mail</p>
  </div>
  <div style="padding:32px 24px">
    <p style="color:#0f1b3f;font-size:1rem">Bonjour <strong>${firstName}</strong>,</p>
    <p style="color:#475569">Merci de rejoindre VIT AUTO ! Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail et activer votre compte.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${verifyUrl}"
         style="background:linear-gradient(135deg,#0f1b3f,#2563eb);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:1rem;display:inline-block">
        ✅ Vérifier mon e-mail
      </a>
    </div>
    <p style="color:#94a3b8;font-size:0.82rem">Ce lien expire dans <strong>24 heures</strong>. Si vous n'avez pas créé de compte, ignorez cet e-mail.</p>
    <p style="color:#94a3b8;font-size:0.78rem;word-break:break-all">Lien direct : ${verifyUrl}</p>
  </div>
  <div style="background:#f1f5f9;padding:16px 24px;text-align:center">
    <p style="color:#94a3b8;font-size:0.78rem;margin:0">© 2026 VIT AUTO — Tous droits réservés</p>
  </div>
</div>
</body></html>`;
}

export function passwordResetTemplate(firstName, resetUrl) {
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:0;margin:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#0f1b3f,#1e40af);padding:32px 24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:1.6rem">🚗 VIT AUTO</h1>
    <p style="color:rgba(255,255,255,.8);margin:6px 0 0">Réinitialisation de votre mot de passe</p>
  </div>
  <div style="padding:32px 24px">
    <p style="color:#0f1b3f;font-size:1rem">Bonjour <strong>${firstName}</strong>,</p>
    <p style="color:#475569">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${resetUrl}"
         style="background:linear-gradient(135deg,#ff4d2d,#e03519);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:1rem;display:inline-block">
        🔑 Réinitialiser mon mot de passe
      </a>
    </div>
    <p style="color:#94a3b8;font-size:0.82rem">Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.</p>
    <p style="color:#94a3b8;font-size:0.78rem;word-break:break-all">Lien direct : ${resetUrl}</p>
  </div>
  <div style="background:#f1f5f9;padding:16px 24px;text-align:center">
    <p style="color:#94a3b8;font-size:0.78rem;margin:0">© 2026 VIT AUTO — Tous droits réservés</p>
  </div>
</div>
</body></html>`;
}

export function identityRejectedTemplate(firstName, reason) {
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <h2 style="color:#0f1b3f">🚗 VIT AUTO — Vérification d'identité</h2>
  <p>Bonjour <strong>${firstName}</strong>,</p>
  <p>Votre dossier d'identité a été <strong style="color:#ef4444">refusé</strong> pour la raison suivante :</p>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;color:#991b1b">${reason || "Documents insuffisants ou illisibles."}</div>
  <p>Merci de soumettre à nouveau votre dossier depuis votre espace profil.</p>
</div></body></html>`;
}
