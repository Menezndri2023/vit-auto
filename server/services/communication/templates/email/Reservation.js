import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, dataTable, infoBox, badge } from "../shared/components.js";

function fmt(d) {
  return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
}

export function reservationCreatedTemplate({ firstName, reservation, vehicleName, destCountry, dashboardUrl }, trackingPixel = "") {
  const { reference, createdAt, status } = reservation || {};

  const body = `
    ${heroSection("Demande de réservation envoyée", `Import/Export — ${vehicleName || "Véhicule"}`, "📦")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre demande de réservation a été transmise au partenaire exportateur.
      Vous recevrez une confirmation sous 24-48h.
    </p>

    ${dataTable([
      ["Référence", `<strong>${reference || "—"}</strong>`, true],
      ["Véhicule",  vehicleName || "—"],
      ["Destination", destCountry || "—"],
      ["Date de demande", fmt(createdAt)],
      ["Statut", badge("En attente", BRAND.warning)],
    ])}

    ${infoBox(`
      Le partenaire dispose de <strong>48 heures</strong> pour confirmer votre réservation.
      Vous serez notifié par e-mail dès qu'il répondra.
    `, "info")}

    ${btn("Suivre ma réservation", dashboardUrl || BRAND.baseUrl + "/dashboard", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Demande de réservation",
    preheader: `Votre demande pour ${vehicleName} a été envoyée — en attente de confirmation`,
    body,
  });
}

export function reservationConfirmedTemplate({ firstName, reservation, vehicleName, partnerName, nextSteps, dashboardUrl }, trackingPixel = "") {
  const { reference } = reservation || {};

  const body = `
    ${heroSection("Réservation confirmée par le partenaire ✅", vehicleName || "Votre véhicule", "🚢")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      <strong>${partnerName}</strong> a confirmé votre réservation. Le processus d'importation peut maintenant débuter.
    </p>

    ${dataTable([
      ["Référence", `<strong>${reference || "—"}</strong>`, true],
      ["Partenaire", partnerName || "—"],
      ["Véhicule",  vehicleName || "—"],
      ["Statut", badge("Confirmée", BRAND.success)],
    ])}

    ${nextSteps ? infoBox(`<strong>Prochaine étape :</strong><br>${nextSteps}`, "success") : ""}
    ${btn("Continuer le processus", dashboardUrl || BRAND.baseUrl + "/dashboard", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Réservation confirmée",
    preheader: `${partnerName} a confirmé votre réservation — le processus démarre`,
    body,
  });
}

export function transactionCompletedTemplate({ firstName, vehicleName, transaction, reviewUrl }, trackingPixel = "") {
  const { reference, totalAmount, devise = "XOF" } = transaction || {};

  const body = `
    ${heroSection("Transaction complétée avec succès 🎉", "Les fonds ont été libérés au partenaire", "✅")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre transaction pour le véhicule <strong>${vehicleName}</strong> est maintenant finalisée.
      Merci de nous avoir fait confiance pour ce processus d'importation.
    </p>

    ${dataTable([
      ["Référence", `<strong>${reference || "—"}</strong>`, true],
      ["Véhicule", vehicleName || "—"],
      ["Montant total", `${Number(totalAmount || 0).toLocaleString("fr-FR")} ${devise}`, true],
      ["Statut", badge("Complétée", BRAND.success)],
    ])}

    ${infoBox("Votre avis nous aide à améliorer nos services. Prenez 2 minutes pour évaluer votre expérience.", "neutral")}
    ${reviewUrl ? btn("Laisser un avis", reviewUrl, "outline") : ""}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Transaction complétée",
    preheader: `Transaction ${reference} finalisée — merci pour votre confiance`,
    body,
  });
}
