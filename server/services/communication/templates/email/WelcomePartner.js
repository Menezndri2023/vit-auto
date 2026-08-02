import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, dataTable, divider, badge, stepTimeline, escapeHtml } from "../shared/components.js";

export function welcomePartnerTemplate({ firstName, companyName, partnerType, dashboardUrl, refNumber }, trackingPixel = "") {
  const typeLabel = {
    agence_location:           "Agence de location",
    concessionnaire:           "Concessionnaire",
    importateur_exportateur:   "Importateur / Exportateur",
    chauffeur_professionnel:   "Chauffeur professionnel",
    expert_auto:               "Expert automobile",
    transitaire_logistique:    "Transitaire / Logistique",
    financement:               "Financement",
    assurance:                 "Assurance",
    inspecteur_vehicles:       "Inspecteur de véhicules",
  };

  const steps = [
    { label: "Dossier soumis", desc: "Votre candidature a été reçue", done: true },
    { label: "Vérification en cours", desc: "Notre équipe examine votre dossier", active: true },
    { label: "LOI envoyée", desc: "Lettre d'intention à signer" },
    { label: "Accord finalisé", desc: "Signature de l'accord partenaire" },
    { label: "Compte actif", desc: "Vous pouvez commencer à opérer" },
  ];

  const body = `
    ${heroSection("Bienvenue dans le programme Founding Partner", "Votre candidature a bien été reçue — nous vous recontacterons sous 48h", "🎉")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre dossier partenaire pour <strong>${escapeHtml(companyName)}</strong> a été reçu avec succès.
      Notre équipe procède actuellement à la vérification de vos informations.
    </p>

    ${dataTable([
      ["Référence dossier", `<strong>${refNumber || "—"}</strong>`, true],
      ["Type de partenaire", typeLabel[partnerType] || partnerType],
      ["Programme", "Founding Partner 🏆"],
    ])}

    <h3 style="font-size:16px;font-weight:700;color:${BRAND.primary};margin:24px 0 16px">Prochaines étapes</h3>
    ${stepTimeline(steps)}

    ${infoBox(`
      <strong>Programme limité à 20 Founding Partners.</strong><br>
      En tant que partenaire fondateur, vous bénéficiez d'une commission de 10% sur les transactions directes
      et de 2% sur les transactions de votre réseau.
    `, "info")}

    ${btn("Suivre mon dossier", dashboardUrl || BRAND.baseUrl + "/partner-onboarding", "primary")}
    ${signature("L'équipe VIT AUTO Partenaires")}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Bienvenue Partenaire",
    preheader: `Votre dossier ${escapeHtml(companyName)} a été reçu — bienvenue dans VIT AUTO`,
    body,
  });
}

export function loiReadyTemplate({ firstName, companyName, loiUrl, expiresAt }, trackingPixel = "") {
  const body = `
    ${heroSection("Votre Lettre d'Intention (LOI) est prête", "Signez pour passer à l'étape suivante", "📝")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre dossier partenaire pour <strong>${escapeHtml(companyName)}</strong> a été examiné avec succès.
      Votre Lettre d'Intention officielle est maintenant disponible pour signature.
    </p>

    ${infoBox(`
      <strong>Cette LOI doit être signée avant le ${expiresAt ? new Date(expiresAt).toLocaleDateString("fr-FR") : "—"}.</strong><br>
      Passé ce délai, votre dossier pourrait être mis en attente.
    `, "warning")}

    ${btn("Signer la LOI maintenant", loiUrl, "primary")}

    <p style="font-size:13px;color:${BRAND.muted};margin:16px 0 0">
      En signant cette LOI, vous confirmez votre intention de rejoindre le programme Founding Partner VIT AUTO
      et acceptez les termes commerciaux préliminaires.
    </p>
    <p style="font-size:13px;color:${BRAND.muted};margin:8px 0 0">
      💡 Ce même lien vous permettra, juste après, de signer directement votre Accord de Partenariat Fondateur — aucun autre email n'est nécessaire.
    </p>
    ${signature("L'équipe VIT AUTO Partenaires")}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "LOI prête à signer",
    preheader: `Votre Lettre d'Intention VIT AUTO est disponible — signez maintenant`,
    body,
  });
}

export function agreementReadyTemplate({ firstName, companyName, agreementUrl, expiresAt }, trackingPixel = "") {
  const body = `
    ${heroSection("Votre Accord Partenaire est prêt", "Dernière étape avant l'activation de votre compte", "🤝")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Félicitations ! Votre Lettre d'Intention a été validée.
      L'Accord Partenaire officiel pour <strong>${escapeHtml(companyName)}</strong> est maintenant disponible.
    </p>

    ${infoBox(`
      <strong>⚡ Plus qu'une étape !</strong><br>
      Après signature de cet accord, votre compte partenaire sera activé et vous pourrez
      commencer à opérer sur la plateforme VIT AUTO.
    `, "success")}

    ${btn("Signer l'Accord Partenaire", agreementUrl, "primary")}
    ${signature("L'équipe VIT AUTO Partenaires")}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Accord partenaire",
    preheader: `Votre accord partenaire VIT AUTO est prêt — activez votre compte`,
    body,
  });
}

// Email de relance — regroupe en UN seul envoi tous les documents encore en
// attente de signature (LOI et/ou Accord), au lieu de deux emails séparés à
// des moments différents. Utilisé par le renvoi manuel admin
// (adminResendDocuments) et par la relance automatique
// (checkFoundingPartnerPendingSignature) quand un dossier reste bloqué à
// l'étape loi_envoyee/accord_envoye sans signature.
export function documentsReadyTemplate({ firstName, companyName, loiUrl, agreementUrl, expiresAt }, trackingPixel = "") {
  const pending = [
    loiUrl       && { label: "Lettre d'Intention (LOI)",              url: loiUrl,       cta: "Signer la LOI" },
    agreementUrl && { label: "Accord de Partenariat Fondateur",       url: agreementUrl, cta: "Signer l'Accord Partenaire" },
  ].filter(Boolean);

  const body = `
    ${heroSection("Votre dossier Founding Partner vous attend", "Un ou plusieurs documents restent à signer pour continuer", "✍️")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre dossier partenaire pour <strong>${escapeHtml(companyName)}</strong> ne peut pas avancer tant que le document ci-dessous
      n'est pas signé. Voici un nouveau lien sécurisé — le précédent lien peut ne plus fonctionner.
    </p>

    ${infoBox(`
      <strong>Ce lien est valable jusqu'au ${expiresAt ? new Date(expiresAt).toLocaleDateString("fr-FR") : "—"}.</strong><br>
      En cas de nouveau souci pour signer, répondez simplement à cet email — notre équipe vous aidera directement.
    `, "warning")}

    ${pending.map(p => btn(p.cta, p.url, "primary")).join("")}

    <p style="font-size:13px;color:${BRAND.muted};margin:16px 0 0">
      Signer votre LOI vous amène automatiquement à l'Accord juste après, sur la même page — aucun autre email n'est nécessaire.
    </p>
    ${signature("L'équipe VIT AUTO Partenaires")}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Documents à signer — Founding Partner",
    preheader: `Votre dossier ${escapeHtml(companyName)} attend votre signature`,
    body,
  });
}
