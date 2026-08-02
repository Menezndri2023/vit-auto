import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, dataTable, infoBox, badge, escapeHtml } from "../shared/components.js";

function fmt(d) {
  return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
}

export function reservationCreatedTemplate({ firstName, reservation, vehicleName, destCountry, dashboardUrl }, trackingPixel = "") {
  const { reference, createdAt, status } = reservation || {};
  const safeVehicleName = escapeHtml(vehicleName);

  const body = `
    ${heroSection("Demande de réservation envoyée", `Import/Export — ${safeVehicleName || "Véhicule"}`, "📦")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre demande de réservation a été transmise au partenaire exportateur.
      Vous recevrez une confirmation sous 24-48h.
    </p>

    ${dataTable([
      ["Référence", `<strong>${escapeHtml(reference) || "—"}</strong>`, true],
      ["Véhicule",  safeVehicleName || "—"],
      ["Destination", escapeHtml(destCountry) || "—"],
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
    preheader: `Votre demande pour ${safeVehicleName} a été envoyée — en attente de confirmation`,
    body,
  });
}

export function reservationConfirmedTemplate({ firstName, reservation, vehicleName, partnerName, nextSteps, dashboardUrl }, trackingPixel = "") {
  const { reference } = reservation || {};
  const safeVehicleName = escapeHtml(vehicleName);
  const safePartnerName = escapeHtml(partnerName);

  const body = `
    ${heroSection("Réservation confirmée par le partenaire ✅", safeVehicleName || "Votre véhicule", "🚢")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      <strong>${safePartnerName}</strong> a confirmé votre réservation. Le processus d'importation peut maintenant débuter.
    </p>

    ${dataTable([
      ["Référence", `<strong>${escapeHtml(reference) || "—"}</strong>`, true],
      ["Partenaire", safePartnerName || "—"],
      ["Véhicule",  safeVehicleName || "—"],
      ["Statut", badge("Confirmée", BRAND.success)],
    ])}

    ${nextSteps ? infoBox(`<strong>Prochaine étape :</strong><br>${escapeHtml(nextSteps)}`, "success") : ""}
    ${btn("Continuer le processus", dashboardUrl || BRAND.baseUrl + "/dashboard", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Réservation confirmée",
    preheader: `${safePartnerName} a confirmé votre réservation — le processus démarre`,
    body,
  });
}

export function transactionCompletedTemplate({ firstName, vehicleName, transaction, reviewUrl }, trackingPixel = "") {
  const { reference, totalAmount, devise = "USD" } = transaction || {};
  const safeVehicleName = escapeHtml(vehicleName);

  const body = `
    ${heroSection("Transaction complétée avec succès 🎉", "Les fonds ont été libérés au partenaire", "✅")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre transaction pour le véhicule <strong>${safeVehicleName}</strong> est maintenant finalisée.
      Merci de nous avoir fait confiance pour ce processus d'importation.
    </p>

    ${dataTable([
      ["Référence", `<strong>${escapeHtml(reference) || "—"}</strong>`, true],
      ["Véhicule", safeVehicleName || "—"],
      ["Montant total", `${Number(totalAmount || 0).toLocaleString("fr-FR")} ${escapeHtml(devise)}`, true],
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
