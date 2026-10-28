import { baseEmail, BRAND } from "../shared/base.js";
import { btn, heroSection, greeting, signature, infoBox, escapeHtml } from "../shared/components.js";

// VIT-AUTO Logistique (2026-10-28) — un seul modèle pour les étapes d'un
// dossier (demande reçue, devis, acceptation, étapes de transport,
// enlèvement). Tout texte venant d'un utilisateur (villes, notes, raison
// sociale) est échappé. Rappel systématique : mise en relation gratuite.
export function logistiqueNotificationTemplate({ firstName, titre, message, lien, country } = {}) {
  const url = lien ? `${BRAND.baseUrl}${lien}` : `${BRAND.baseUrl}/logistique`;
  const body = `
    ${heroSection(escapeHtml(titre || "VIT-AUTO Logistique"), "VIT-AUTO Logistique", "📦")}
    ${greeting(escapeHtml(firstName || ""))}
    <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;margin:0 0 20px">${escapeHtml(message || "")}</p>
    ${btn("Ouvrir le dossier", url, "primary")}
    ${infoBox("Mise en relation gratuite : VIT AUTO ne prélève aucune commission ni aucun frais sur le transport. Le prix se règle directement avec le prestataire retenu.", "info")}
    ${signature("L'équipe VIT-AUTO Logistique")}
  `;
  // baseEmail insère titre et aperçu tels quels : on les échappe ici.
  return baseEmail({ title: escapeHtml(titre || "VIT-AUTO Logistique"), preheader: escapeHtml(message || ""), body, country });
}
