import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, dataTable, divider, infoBox, escapeHtml } from "../shared/components.js";

export function invoiceTemplate({ firstName, invoice, downloadUrl, country }, trackingPixel = "") {
  const {
    invoiceNumber, issueDate, dueDate,
    items = [], subtotal, taxRate, taxAmount, total,
    devise = "USD", status, partnerName,
  } = invoice || {};
  const safeInvoiceNumber = escapeHtml(invoiceNumber);
  const safePartnerName = escapeHtml(partnerName);
  const safeDevise = escapeHtml(devise);

  const fmt = (n) => Number(n || 0).toLocaleString("fr-FR");
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  const statusColors = { paid: BRAND.success, pending: BRAND.warning, overdue: BRAND.danger };
  const statusLabel  = { paid: "Payée", pending: "En attente", overdue: "En retard" };

  const body = `
    ${heroSection("Votre facture est disponible", `Facture N° ${safeInvoiceNumber || "—"}`, "🧾")}
    ${greeting(firstName)}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">
      Une nouvelle facture a été générée pour votre compte. Vous pouvez la consulter et la télécharger ci-dessous.
    </p>

    ${dataTable([
      ["Numéro de facture", `<strong>${safeInvoiceNumber || "—"}</strong>`, true],
      ["Émis le", fmtDate(issueDate)],
      ...(dueDate ? [["Date d'échéance", fmtDate(dueDate)]] : []),
      ...(partnerName ? [["Partenaire", safePartnerName]] : []),
      ["Statut", `<span style="color:${statusColors[status] || BRAND.muted};font-weight:700">${statusLabel[status] || escapeHtml(status) || "—"}</span>`],
    ])}

    ${divider()}

    <!-- Lignes de la facture -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">
      <thead>
        <tr style="background:${BRAND.primary}">
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left;border-radius:6px 0 0 0">Description</th>
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:center">Qté</th>
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:right;border-radius:0 6px 0 0">Montant</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
        <tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"}">
          <td style="padding:10px 12px;font-size:13px;color:${BRAND.text}">${escapeHtml(item.description) || "—"}</td>
          <td style="padding:10px 12px;font-size:13px;color:${BRAND.muted};text-align:center">${item.qty || 1}</td>
          <td style="padding:10px 12px;font-size:13px;color:${BRAND.text};font-weight:600;text-align:right">${fmt(item.amount)} ${safeDevise}</td>
        </tr>`).join("")}
      </tbody>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0">
      <tr>
        <td></td>
        <td width="200" style="border-top:2px solid ${BRAND.border};padding-top:12px">
          ${subtotal !== undefined ? `<table width="100%"><tr><td style="font-size:13px;color:${BRAND.muted}">Sous-total</td><td style="font-size:13px;text-align:right">${fmt(subtotal)} ${safeDevise}</td></tr></table>` : ""}
          ${taxAmount   ? `<table width="100%"><tr><td style="font-size:13px;color:${BRAND.muted}">TVA (${taxRate || 0}%)</td><td style="font-size:13px;text-align:right">${fmt(taxAmount)} ${safeDevise}</td></tr></table>` : ""}
          <table width="100%"><tr>
            <td style="font-size:16px;font-weight:800;color:${BRAND.primary};padding-top:8px">Total</td>
            <td style="font-size:16px;font-weight:800;color:${BRAND.accent};text-align:right;padding-top:8px">${fmt(total)} ${safeDevise}</td>
          </tr></table>
        </td>
      </tr>
    </table>

    ${btn("Télécharger la facture PDF", downloadUrl || BRAND.baseUrl + "/dashboard", "dark")}
    ${signature()}
    ${trackingPixel}
  `;
  return baseEmail({
    title: `Facture ${safeInvoiceNumber}`,
    preheader: `Facture N°${safeInvoiceNumber} — Total: ${fmt(total)} ${safeDevise}`,
    body,
    country,
  });
}
