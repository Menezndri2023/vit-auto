import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, dataTable, divider, escapeHtml } from "../shared/components.js";

export function contractReadyTemplate({ firstName, contractTitle, contractRef, signUrl, expiresAt, amount, devise = "USD", country }, trackingPixel = "") {
  const safeContractTitle = escapeHtml(contractTitle);
  const body = `
    ${heroSection("Contrat prêt à signer", safeContractTitle || "Votre contrat VIT AUTO", "📄")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Un contrat requiert votre signature. Veuillez le consulter et le signer avant la date limite.
    </p>

    ${dataTable([
      ["Référence", `<strong>${escapeHtml(contractRef) || "—"}</strong>`, true],
      ["Contrat",   safeContractTitle || "—"],
      ...(amount   ? [["Montant",  `${Number(amount).toLocaleString("fr-FR")} ${escapeHtml(devise)}`, true]] : []),
      ...(expiresAt ? [["Expire le", new Date(expiresAt).toLocaleDateString("fr-FR")]] : []),
    ])}

    ${infoBox("En signant ce contrat, vous acceptez les termes et conditions VIT AUTO associés à cette transaction.", "neutral")}
    ${btn("Lire et signer le contrat", signUrl || BRAND.baseUrl + "/dashboard", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Contrat à signer",
    preheader: `Votre contrat ${escapeHtml(contractRef)} est prêt — signature requise`,
    body,
    country,
  });
}

export function contractSignedTemplate({ firstName, contractTitle, contractRef, downloadUrl, counterpartyName, country }, trackingPixel = "") {
  const safeContractTitle = escapeHtml(contractTitle);
  const safeCounterpartyName = escapeHtml(counterpartyName);
  const body = `
    ${heroSection("Contrat signé ✅", "Les deux parties ont signé", "🤝")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Le contrat <strong>${safeContractTitle}</strong> a été signé par toutes les parties.
      ${safeCounterpartyName ? `<strong>${safeCounterpartyName}</strong> a également signé.` : ""}
      Un exemplaire PDF est disponible en téléchargement.
    </p>

    ${dataTable([
      ["Référence", `<strong>${escapeHtml(contractRef) || "—"}</strong>`, true],
      ["Contrat",   safeContractTitle || "—"],
      ["Statut",    "✅ Signé par toutes les parties"],
    ])}

    ${btn("Télécharger le contrat signé", downloadUrl || BRAND.baseUrl + "/dashboard", "dark")}
    ${infoBox("Conservez ce document dans un endroit sûr. Il constitue la preuve légale de votre accord.", "info")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Contrat signé",
    preheader: `Contrat ${escapeHtml(contractRef)} signé par toutes les parties — téléchargez votre exemplaire`,
    body,
    country,
  });
}
