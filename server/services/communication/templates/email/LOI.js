import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, dataTable, divider, stepTimeline, escapeHtml } from "../shared/components.js";

export function loiSignedTemplate({ firstName, companyName, loiRef, nextStepDate }, trackingPixel = "") {
  const body = `
    ${heroSection("LOI signée avec succès ✅", "Votre Lettre d'Intention a été enregistrée", "📋")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre Lettre d'Intention pour <strong>${escapeHtml(companyName)}</strong> a été signée et enregistrée avec succès.
      Notre équipe prépare maintenant l'Accord Partenaire définitif.
    </p>

    ${dataTable([
      ["Référence LOI", loiRef || "—", true],
      ["Entreprise",   escapeHtml(companyName) || "—"],
      ["Statut",       "Signée et validée ✓"],
      ...(nextStepDate ? [["Accord attendu avant", new Date(nextStepDate).toLocaleDateString("fr-FR")]] : []),
    ])}

    ${stepTimeline([
      { label: "Dossier soumis",        done: true },
      { label: "Vérification complète", done: true },
      { label: "LOI signée",            done: true },
      { label: "Accord Partenaire",     active: true, desc: "En cours de préparation" },
      { label: "Compte actif" },
    ])}

    ${infoBox("Vous recevrez l'Accord Partenaire par e-mail dès qu'il sera prêt. Ce processus prend généralement 2-5 jours ouvrables.", "info")}
    ${signature("L'équipe VIT AUTO Partenaires")}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "LOI signée",
    preheader: `Votre LOI ${escapeHtml(companyName)} a été signée — accord partenaire en cours`,
    body,
  });
}

export function agreementSignedTemplate({ firstName, companyName, commissionRate, networkRate, dashboardUrl }, trackingPixel = "") {
  const body = `
    ${heroSection("🎉 Bienvenue dans le réseau VIT AUTO !", "Votre accord est signé — votre compte est activé", "🏆")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Félicitations ! L'accord partenaire pour <strong>${escapeHtml(companyName)}</strong> a été signé et votre compte
      est maintenant <strong>actif</strong>. Vous faites partie des Founding Partners VIT AUTO !
    </p>

    ${dataTable([
      ["Statut du compte",      "🟢 Actif", true],
      ["Commission directe",   `${commissionRate || 10}% sur vos transactions`],
      ["Commission réseau",    `${networkRate || 2}% sur votre réseau de partenaires`],
      ["Programme",            "🏆 Founding Partner"],
    ])}

    ${infoBox(`
      <strong>Avantages Founding Partner :</strong><br>
      ✓ Accès prioritaire aux nouvelles fonctionnalités<br>
      ✓ Support dédié VIT AUTO<br>
      ✓ Commissions préférentielles à vie<br>
      ✓ Showroom public sur la plateforme
    `, "success")}

    ${btn("Accéder à mon tableau de bord", dashboardUrl || BRAND.baseUrl + "/partner-pms", "primary")}
    ${signature("L'équipe VIT AUTO Partenaires")}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Compte partenaire activé",
    preheader: `Bienvenue dans VIT AUTO ! Votre compte ${escapeHtml(companyName)} est actif`,
    body,
  });
}
