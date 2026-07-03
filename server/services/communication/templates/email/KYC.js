import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, dataTable, badge } from "../shared/components.js";

export function kycSubmittedTemplate({ firstName, kycType = "identité", dashboardUrl }, trackingPixel = "") {
  const body = `
    ${heroSection("Dossier KYC soumis ✅", "Votre dossier est en cours d'examen", "🔍")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre dossier de vérification <strong>${kycType}</strong> a été soumis avec succès.
      Notre équipe procède à l'examen sous <strong>24-72 heures</strong>.
    </p>

    ${infoBox(`
      <strong>Ce qui va se passer :</strong><br>
      ① Notre équipe examine vos documents<br>
      ② Une vérification OCR et faciale est effectuée<br>
      ③ Vous recevez un e-mail de validation ou de refus
    `, "info")}

    ${btn("Voir mon dossier", dashboardUrl || BRAND.baseUrl + "/profile", "outline")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "KYC soumis",
    preheader: "Votre dossier de vérification est en cours d'examen — résultat sous 72h",
    body,
  });
}

export function kycApprovedTemplate({ firstName, kycBadge, kycScore, dashboardUrl }, trackingPixel = "") {
  const badgeColors = { VERIFIE: BRAND.success, INSUFFISANT: BRAND.warning, REFUSE: BRAND.danger };
  const badgeLabels = { VERIFIE: "Vérifié ✓", INSUFFISANT: "Insuffisant", REFUSE: "Refusé" };

  const body = `
    ${heroSection("Vérification d'identité approuvée ! 🎉", "Votre compte est maintenant vérifié", "✅")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre dossier de vérification a été examiné et <strong>approuvé</strong> avec succès.
      Vous bénéficiez maintenant d'un accès complet à toutes les fonctionnalités VIT AUTO.
    </p>

    ${dataTable([
      ["Statut KYC",  badge(badgeLabels[kycBadge] || kycBadge || "Vérifié", badgeColors[kycBadge] || BRAND.success)],
      ...(kycScore !== undefined ? [["Score de confiance", `${kycScore}/100`, true]] : []),
    ])}

    ${infoBox("Compte vérifié : accès à toutes les fonctionnalités, transactions sans limite et badge de confiance sur votre profil.", "success")}
    ${btn("Accéder à mon profil vérifié", dashboardUrl || BRAND.baseUrl + "/profile", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Identité vérifiée",
    preheader: "Votre identité a été vérifiée — accès complet à VIT AUTO débloqué",
    body,
  });
}

export function kycRejectedTemplate({ firstName, reason, resubmitUrl }, trackingPixel = "") {
  const body = `
    ${heroSection("Vérification refusée", "Des informations complémentaires sont nécessaires", "⚠️")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Malheureusement, votre dossier de vérification n'a pas pu être approuvé pour la raison suivante :
    </p>

    ${infoBox(`<strong>Motif :</strong><br>${reason || "Documents insuffisants ou illisibles."}`, "danger")}

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:16px 0">
      Vous pouvez soumettre un nouveau dossier avec des documents plus lisibles.
      Assurez-vous que les photos sont nettes, sans reflet et que toutes les informations sont visibles.
    </p>

    ${btn("Soumettre un nouveau dossier", resubmitUrl || BRAND.baseUrl + "/profile", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Vérification refusée",
    preheader: "Votre vérification d'identité n'a pas pu être approuvée — soumettez à nouveau",
    body,
  });
}
