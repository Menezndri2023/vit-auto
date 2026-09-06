import { baseEmail } from "../shared/base.js";
import { greeting, signature, escapeHtml, btn } from "../shared/components.js";

// Filet de sécurité (Booking Engine, 2026-09) : toute notification interne/push
// (Notification.post("save"), voir server/models/Notification.js) déclenche
// aussi cet email générique, sauf `skipEmail:true` — garantit qu'un événement
// qui ne serait sinon visible qu'en push/in-app atteint toujours le client par
// email tant que le canal push n'est pas pleinement fiable en production.
export function genericNotificationTemplate({ firstName, titre, message, lien }, trackingPixel = "") {
  const safeTitre   = escapeHtml(titre || "Nouvelle notification");
  const safeMessage = escapeHtml(message || "");
  const safeLien     = lien ? `${process.env.APP_URL || "https://vit-auto.com"}${lien}` : null;

  const body = `
    ${greeting(firstName)}
    <h2 style="font-size:18px;margin:0 0 12px;color:#0f1b3f">${safeTitre}</h2>
    <p style="font-size:14px;color:#1e293b;line-height:1.7;margin:0 0 20px">${safeMessage}</p>
    ${safeLien ? btn("Voir sur VIT AUTO", safeLien) : ""}
    ${signature()}
    ${trackingPixel}
  `;

  return baseEmail({ title: safeTitre, preheader: safeMessage, body });
}
