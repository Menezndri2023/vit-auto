/**
 * VIT AUTO — Validation des images fournies en base64 (data URI)
 *
 * Utilisé partout où le client envoie une image encodée en base64 (KYC recto/
 * verso/selfie, permis de conduire, photo de profil) : avant ceci, seule une
 * vérification côté client existait (contournable), et le préfixe déclaré par
 * le client (`data:image/png;base64,...`) n'était jamais confronté au contenu
 * réel du fichier. Deux protections :
 *   1. Taille décodée plafonnée (protège contre un DoS par payload énorme).
 *   2. Type MIME réel vérifié via les "magic bytes" du buffer décodé — pas
 *      seulement le préfixe déclaré, qu'un client malveillant peut mentir sur.
 */

// ── Détection du vrai type de fichier via ses premiers octets ────────────────
function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return "gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

const DATA_URI_RE = /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Valide une image transmise en data URI base64.
 * @param {string} value    - la data URI complète ("data:image/png;base64,....")
 * @param {number} maxBytes - taille maximale décodée autorisée (octets)
 * @returns {{ ok: boolean, message?: string, detectedType?: string, size?: number }}
 */
export function validateImageDataUri(value, maxBytes) {
  if (!value) return { ok: true }; // champ optionnel, rien à valider

  if (typeof value !== "string") {
    return { ok: false, message: "Format d'image invalide." };
  }

  const match = DATA_URI_RE.exec(value);
  if (!match) {
    return { ok: false, message: "Format d'image invalide (data URI PNG/JPEG/WEBP/GIF attendue)." };
  }

  const base64Part = match[2];

  // Estimation rapide (avant décodage complet) pour éviter de décoder inutilement
  // une charge volumineuse juste pour la rejeter ensuite.
  const approxBytes = (base64Part.length * 3) / 4;
  if (approxBytes > maxBytes) {
    return { ok: false, message: `Image trop volumineuse (max ${Math.round(maxBytes / (1024 * 1024))} Mo).` };
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Part, "base64");
  } catch {
    return { ok: false, message: "Image corrompue ou encodage base64 invalide." };
  }

  if (buffer.length > maxBytes) {
    return { ok: false, message: `Image trop volumineuse (max ${Math.round(maxBytes / (1024 * 1024))} Mo).` };
  }

  const detectedType = detectImageType(buffer);
  if (!detectedType) {
    return { ok: false, message: "Contenu de fichier invalide : ce n'est pas une image PNG/JPEG/WEBP/GIF valide." };
  }

  return { ok: true, detectedType, size: buffer.length };
}

// ── PDF : détection par magic bytes ("%PDF-") ─────────────────────────────────
function isPdf(buffer) {
  return buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-";
}

const DOC_DATA_URI_RE = /^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Valide un document (justificatif entreprise, RIB, carte grise...) transmis en
 * data URI base64 — comme validateImageDataUri, mais accepte aussi le PDF (ces
 * documents administratifs sont fréquemment scannés en PDF, pas seulement en
 * image). Mêmes protections : taille plafonnée + type réel vérifié par magic
 * bytes (bloque au passage un SVG contenant du script, qui n'a pas de signature
 * binaire image/PDF reconnue).
 * @param {string} value    - la data URI complète
 * @param {number} maxBytes - taille maximale décodée autorisée (octets)
 * @returns {{ ok: boolean, message?: string, detectedType?: string, size?: number }}
 */
export function validateDocumentDataUri(value, maxBytes) {
  if (!value) return { ok: true };

  if (typeof value !== "string") {
    return { ok: false, message: "Format de document invalide." };
  }

  const match = DOC_DATA_URI_RE.exec(value);
  if (!match) {
    return { ok: false, message: "Format de document invalide (image ou PDF attendu)." };
  }

  const base64Part = match[2];
  const approxBytes = (base64Part.length * 3) / 4;
  if (approxBytes > maxBytes) {
    return { ok: false, message: `Document trop volumineux (max ${Math.round(maxBytes / (1024 * 1024))} Mo).` };
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Part, "base64");
  } catch {
    return { ok: false, message: "Document corrompu ou encodage base64 invalide." };
  }

  if (buffer.length > maxBytes) {
    return { ok: false, message: `Document trop volumineux (max ${Math.round(maxBytes / (1024 * 1024))} Mo).` };
  }

  if (isPdf(buffer)) {
    return { ok: true, detectedType: "pdf", size: buffer.length };
  }

  const detectedType = detectImageType(buffer);
  if (!detectedType) {
    return { ok: false, message: "Contenu de fichier invalide : ni une image (PNG/JPEG/WEBP/GIF) ni un PDF valide." };
  }

  return { ok: true, detectedType, size: buffer.length };
}
