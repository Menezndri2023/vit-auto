// ── Dépôt d'une pièce justificative sur ImageKit PRIVÉ ──────────────────────
// Partagé par kycController (soumission KYC) et usersController (pièce
// d'identité envoyée depuis la page Profil). Jusqu'au 2026-10-05, ce second
// chemin écrivait encore les photos BRUTES, non chiffrées, dans le document
// User : trois photos de téléphone dépassaient la limite de 16 Mo d'un
// document MongoDB et l'envoi échouait en « Erreur serveur » — un partenaire
// ne parvenait plus à mettre à jour ses justificatifs.
//
// Le fichier part dans un dossier privé (« isPrivateFile », URL signée à la
// lecture par utils/signerDocuments.js) ; l'appelant chiffre l'URL
// (encryptField). Sans ImageKit configuré (dev, tests) ou en cas d'échec de
// dépôt, on retombe sur le data URI : un dossier ne doit jamais être perdu
// parce que le CDN est indisponible.
import { uploadDocument, isImageKitConfigured } from "../config/imagekit.js";

export async function deposerPiece(dataUri, folder, nom) {
  if (!dataUri) return null;
  if (!isImageKitConfigured()) return dataUri;
  const r = await uploadDocument(dataUri, folder, nom);
  return r?.url || dataUri;
}
