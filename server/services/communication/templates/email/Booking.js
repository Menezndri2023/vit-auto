import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, dataTable, divider, badge, infoBox } from "../shared/components.js";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function bookingConfirmationTemplate({ firstName, booking, vehicleName, vehicleImage, dashboardUrl }, trackingPixel = "") {
  const { startDate, endDate, montantTotal, devise = "XOF", status, reference } = booking || {};
  const statusBadge = { confirmed: "Confirmée", preparing: "En préparation", pending: "En attente" };

  const body = `
    ${heroSection("Réservation confirmée ! 🎊", `Votre ${vehicleName || "véhicule"} vous attend`, "🚗")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre réservation a été prise en compte. Voici le récapitulatif :
    </p>

    ${vehicleImage ? `<img src="${vehicleImage}" alt="${vehicleName}" width="100%"
      style="border-radius:10px;margin:0 0 20px;max-height:200px;object-fit:cover"/>` : ""}

    ${dataTable([
      ["Référence", reference || "—", true],
      ["Véhicule", vehicleName || "—"],
      ["Début", formatDate(startDate)],
      ["Fin", formatDate(endDate)],
      ["Montant total", `${Number(montantTotal || 0).toLocaleString("fr-FR")} ${devise}`, true],
      ["Statut", badge(statusBadge[status] || status || "—", BRAND.success)],
    ])}

    ${btn("Gérer ma réservation", dashboardUrl || BRAND.baseUrl + "/dashboard", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Confirmation de réservation",
    preheader: `Votre réservation ${vehicleName} est confirmée — ref: ${reference}`,
    body,
  });
}

export function newBookingPartnerTemplate({ partnerName, clientName, booking, vehicleName, acceptUrl, declineUrl }, trackingPixel = "") {
  const { startDate, endDate, montantTotal, devise = "XOF", reference } = booking || {};

  const body = `
    ${heroSection("Nouvelle réservation reçue", "Un client souhaite réserver votre véhicule", "📋")}
    ${greeting(partnerName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      <strong>${clientName}</strong> a effectué une demande de réservation pour votre véhicule.
      Vous avez <strong>24 heures</strong> pour accepter ou refuser.
    </p>

    ${dataTable([
      ["Référence", reference || "—", true],
      ["Client", clientName],
      ["Véhicule", vehicleName || "—"],
      ["Période", `${formatDate(startDate)} → ${formatDate(endDate)}`],
      ["Montant", `${Number(montantTotal || 0).toLocaleString("fr-FR")} ${devise}`, true],
    ])}

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
      <tr>
        <td style="padding:0 8px 0 0" width="50%">
          <a href="${acceptUrl}" style="display:block;background:${BRAND.success};color:#fff;text-decoration:none;
            padding:13px 20px;border-radius:10px;font-weight:700;font-size:14px;text-align:center">
            ✓ Accepter
          </a>
        </td>
        <td style="padding:0 0 0 8px" width="50%">
          <a href="${declineUrl}" style="display:block;background:#fff;color:${BRAND.danger};border:2px solid ${BRAND.danger};
            text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;font-size:14px;text-align:center">
            ✕ Refuser
          </a>
        </td>
      </tr>
    </table>
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Nouvelle réservation",
    preheader: `${clientName} a réservé ${vehicleName} — répondez dans 24h`,
    body,
  });
}

export function bookingAcceptedTemplate({ firstName, vehicleName, booking, partnerName, partnerPhone, dashboardUrl }, trackingPixel = "") {
  const { startDate, endDate, pickupAddress, reference } = booking || {};

  const body = `
    ${heroSection("Votre réservation a été acceptée ✅", "Le partenaire a confirmé votre demande", "🎯")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Excellente nouvelle ! <strong>${partnerName}</strong> a accepté votre réservation pour le <strong>${vehicleName}</strong>.
    </p>

    ${dataTable([
      ["Référence", reference || "—", true],
      ["Début", formatDate(startDate)],
      ["Fin", formatDate(endDate)],
      ...(pickupAddress ? [["Adresse de prise en charge", pickupAddress]] : []),
      ...(partnerPhone  ? [["Contact partenaire", partnerPhone]] : []),
    ])}

    ${infoBox("Pensez à vérifier vos documents (permis de conduire, pièce d'identité) avant le jour de prise en charge.", "info")}
    ${btn("Voir les détails", dashboardUrl || BRAND.baseUrl + "/dashboard", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Réservation acceptée",
    preheader: `${partnerName} a accepté votre réservation pour ${vehicleName}`,
    body,
  });
}
