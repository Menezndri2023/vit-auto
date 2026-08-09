import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, dataTable, divider, badge, infoBox, escapeHtml } from "../shared/components.js";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Bug réel corrigé (audit sécurité) : vehicleName/clientName/partnerName sont
// des champs saisis par un AUTRE utilisateur que le destinataire de l'email
// (le nom du client atterrit dans l'email du partenaire et vice-versa) —
// jamais échappés avant interpolation, ouvrant la porte à une injection de
// faux bouton/lien de phishing dans un email signé VIT AUTO. `dataTable`/
// `badge()` ne peuvent pas échapper eux-mêmes (utilisés aussi avec du HTML
// légitime, ex: badge()) — l'échappement se fait donc ici, au point où le
// champ non fiable rencontre le HTML.

export function bookingConfirmationTemplate({ firstName, booking, vehicleName, vehicleImage, dashboardUrl, country }, trackingPixel = "") {
  const { startDate, endDate, montantTotal, devise = "XOF", status, reference } = booking || {};
  const statusBadge = { confirmed: "Confirmée", preparing: "En préparation", pending: "En attente" };
  const safeVehicleName = escapeHtml(vehicleName);

  const body = `
    ${heroSection("Réservation confirmée ! 🎊", `Votre ${safeVehicleName || "véhicule"} vous attend`, "🚗")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre réservation a été prise en compte. Voici le récapitulatif :
    </p>

    ${vehicleImage ? `<img src="${vehicleImage}" alt="${safeVehicleName}" width="100%"
      style="border-radius:10px;margin:0 0 20px;max-height:200px;object-fit:cover"/>` : ""}

    ${dataTable([
      ["Référence", escapeHtml(reference) || "—", true],
      ["Véhicule", safeVehicleName || "—"],
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
    preheader: `Votre réservation ${safeVehicleName} est confirmée — ref: ${escapeHtml(reference)}`,
    body,
    country,
  });
}

export function newBookingPartnerTemplate({ partnerName, clientName, booking, vehicleName, acceptUrl, declineUrl, country }, trackingPixel = "") {
  const { startDate, endDate, montantTotal, devise = "XOF", reference } = booking || {};
  const safeClientName  = escapeHtml(clientName);
  const safeVehicleName = escapeHtml(vehicleName);

  const body = `
    ${heroSection("Nouvelle réservation reçue", "Un client souhaite réserver votre véhicule", "📋")}
    ${greeting(partnerName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      <strong>${safeClientName}</strong> a effectué une demande de réservation pour votre véhicule.
      Vous avez <strong>24 heures</strong> pour accepter ou refuser.
    </p>

    ${dataTable([
      ["Référence", escapeHtml(reference) || "—", true],
      ["Client", safeClientName],
      ["Véhicule", safeVehicleName || "—"],
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
    preheader: `${safeClientName} a réservé ${safeVehicleName} — répondez dans 24h`,
    body,
    country,
  });
}

export function paymentReceiptTemplate({ firstName, vehicleName, booking, downloadUrl, country }, trackingPixel = "") {
  const { reference, montantTotal, devise = "XOF", paymentMethod } = booking || {};
  const methodLabels = {
    cash: "Espèces sur place", card: "Carte bancaire", orange_money: "Orange Money",
    wave: "Wave", mtn: "MTN Money", moov: "Moov Money", virement: "Virement bancaire",
  };
  const safeVehicleName = escapeHtml(vehicleName);

  const body = `
    ${heroSection("Paiement confirmé ✅", "Votre reçu est joint à cet email", "🧾")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Votre transaction pour <strong>${safeVehicleName || "votre véhicule"}</strong> a bien été réglée. Vous trouverez le reçu de paiement au format PDF en pièce jointe.
    </p>

    ${dataTable([
      ["Référence", escapeHtml(reference) || "—", true],
      ["Véhicule", safeVehicleName || "—"],
      ["Mode de paiement", methodLabels[paymentMethod] || paymentMethod || "—"],
      ["Montant total", `${Number(montantTotal || 0).toLocaleString("fr-FR")} ${devise}`, true],
      ["Statut", badge("Payé", BRAND.success)],
    ])}

    ${downloadUrl ? btn("Voir ma réservation", downloadUrl, "primary") : ""}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Reçu de paiement",
    preheader: `Reçu ${escapeHtml(reference)} — ${Number(montantTotal || 0).toLocaleString("fr-FR")} ${devise}`,
    body,
    country,
  });
}

export function bookingAcceptedTemplate({ firstName, vehicleName, booking, partnerName, partnerPhone, dashboardUrl, country }, trackingPixel = "") {
  const { startDate, endDate, pickupAddress, reference } = booking || {};
  const safeVehicleName = escapeHtml(vehicleName);
  const safePartnerName = escapeHtml(partnerName);

  const body = `
    ${heroSection("Votre réservation a été acceptée ✅", "Le partenaire a confirmé votre demande", "🎯")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Excellente nouvelle ! <strong>${safePartnerName}</strong> a accepté votre réservation pour le <strong>${safeVehicleName}</strong>.
    </p>

    ${dataTable([
      ["Référence", escapeHtml(reference) || "—", true],
      ["Début", formatDate(startDate)],
      ["Fin", formatDate(endDate)],
      ...(pickupAddress ? [["Adresse de prise en charge", escapeHtml(pickupAddress)]] : []),
      ...(partnerPhone  ? [["Contact partenaire", escapeHtml(partnerPhone)]] : []),
    ])}

    ${infoBox("Pensez à vérifier vos documents (permis de conduire, pièce d'identité) avant le jour de prise en charge.", "info")}
    ${btn("Voir les détails", dashboardUrl || BRAND.baseUrl + "/dashboard", "primary")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: "Réservation acceptée",
    preheader: `${safePartnerName} a accepté votre réservation pour ${safeVehicleName}`,
    body,
    country,
  });
}
