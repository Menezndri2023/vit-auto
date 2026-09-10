import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, divider, escapeHtml } from "../shared/components.js";

// Demande des pièces légales à un partenaire déjà EN LIGNE grâce à une
// autorisation provisoire de publier.
//
// Le ton est celui d'une régularisation, pas d'une mise en demeure : le
// partenaire vend déjà sur la plateforme, il n'a aucune raison d'être accueilli
// par une menace. Mais l'échéance doit être dite clairement et une seule fois —
// une date floue produit un dossier jamais complété, et un jour la publication
// se ferme sans que personne ait compris pourquoi.
//
// Le message dit aussi ce que la certification APPORTE (le badge visible des
// clients), pas seulement ce qu'elle exige : c'est la seule raison pour
// laquelle quelqu'un ouvre un dossier administratif un mardi soir.

export function partnerDocumentsRequestTemplate(
  { firstName, companyName, annoncesEnLigne, documents = [], dateLimite, onboardingUrl },
  trackingPixel = ""
) {
  const dateLisible = dateLimite
    ? new Date(dateLimite).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const listeDocs = documents.map((d) => `
    <li style="margin:0 0 10px">
      <strong>${escapeHtml(d.label)}</strong>
      ${d.hint ? `<br><span style="color:${BRAND.muted};font-size:13px">${escapeHtml(d.hint)}</span>` : ""}
    </li>`).join("");

  const body = `
    ${heroSection(
      "Vos activités sont en ligne",
      `${annoncesEnLigne} formule${annoncesEnLigne > 1 ? "s" : ""} de ${escapeHtml(companyName)} ${annoncesEnLigne > 1 ? "sont réservables" : "est réservable"} sur VIT AUTO`,
      "🤿"
    )}
    ${greeting(firstName)}

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Vos formules sont publiées et vos clients peuvent déjà réserver. Nous les
      avons mises en ligne sans attendre votre dossier administratif, parce que
      votre activité est vérifiable par ailleurs — mais cette avance a une durée.
    </p>

    ${dateLisible ? infoBox(
      `<strong>Votre publication est ouverte jusqu'au ${escapeHtml(dateLisible)}.</strong><br>`
      + `Passé cette date, sans dossier complet, vos annonces déjà en ligne restent `
      + `visibles mais vous ne pourrez plus en créer de nouvelles. Un seul envoi `
      + `suffit à lever complètement cette limite.`,
      "warning"
    ) : ""}

    <p style="font-size:15px;color:${BRAND.text};font-weight:700;margin:26px 0 8px">
      Les pièces à nous transmettre
    </p>
    <ul style="font-size:14px;color:${BRAND.text};line-height:1.6;margin:0 0 20px;padding-left:20px">
      ${listeDocs}
    </ul>

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Une photo nette prise au téléphone suffit, il n'est pas nécessaire de
      scanner. Tout se dépose depuis votre espace, en une fois.
    </p>

    ${btn("Déposer mes documents", onboardingUrl)}

    ${divider()}
    <p style="font-size:13px;color:${BRAND.muted};line-height:1.6;margin:0">
      Une fois le dossier validé, le badge <strong>Partenaire Vérifié</strong>
      apparaît sur chacune de vos formules. Les clients le voient avant de
      réserver, et c'est ce qui les décide quand ils hésitent entre deux centres.
      <br><br>
      Une question, ou un document que vous n'avez pas sous cette forme ?
      Répondez simplement à cet e-mail : nous trouverons l'équivalent.
    </p>

    ${signature()}
    ${trackingPixel}
  `;

  const subject = `${companyName} — vos formules sont en ligne, il reste vos documents`;

  return {
    subject,
    html: baseEmail({
      title: subject.replace(companyName, escapeHtml(companyName)),
      preheader: "Vos formules sont réservables. Il ne manque que votre dossier administratif.",
      body,
    }),
    text:
      `Bonjour ${firstName},\n\n`
      + `${annoncesEnLigne} formule(s) de ${companyName} sont publiées sur VIT AUTO et vos clients peuvent déjà réserver.\n\n`
      + `Nous les avons mises en ligne sans attendre votre dossier administratif, parce que votre activité est vérifiable par ailleurs — mais cette avance a une durée.\n\n`
      + (dateLisible
        ? `VOTRE PUBLICATION EST OUVERTE JUSQU'AU ${dateLisible.toUpperCase()}.\nPassé cette date, sans dossier complet, vos annonces déjà en ligne restent visibles mais vous ne pourrez plus en créer de nouvelles.\n\n`
        : "")
      + `LES PIÈCES À NOUS TRANSMETTRE\n`
      + documents.map((d) => `- ${d.label}${d.hint ? ` (${d.hint})` : ""}`).join("\n")
      + `\n\nUne photo nette prise au téléphone suffit, il n'est pas nécessaire de scanner.\n\n`
      + `Déposer mes documents : ${onboardingUrl}\n\n`
      + `Une fois le dossier validé, le badge « Partenaire Vérifié » apparaît sur chacune de vos formules — les clients le voient avant de réserver.\n\n`
      + `Une question, ou un document que vous n'avez pas sous cette forme ? Répondez simplement à cet e-mail.\n\nL'équipe VIT AUTO`,
  };
}
