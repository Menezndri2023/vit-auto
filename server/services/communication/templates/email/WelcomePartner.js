import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, dataTable, divider, badge, stepTimeline } from "../shared/components.js";

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
      Votre dossier partenaire pour <strong>${companyName}</strong> a été reçu avec succès.
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
    preheader: `Votre dossier ${companyName} a été reçu — bienvenue dans VIT AUTO`,
    body,
  });
}

export function loiReadyTemplate({ firstName, companyName, loiUrl, expiresAt }, trackingPixel = "") {
  const body = `
    ${heroSection("Votre Lettre d'Intention (LOI) est prête", "Signez pour passer à l'étape suivante", "📝")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre dossier partenaire pour <strong>${companyName}</strong> a été examiné avec succès.
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
      L'Accord Partenaire officiel pour <strong>${companyName}</strong> est maintenant disponible.
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
