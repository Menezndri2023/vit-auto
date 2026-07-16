import crypto from "crypto";

// ── Chiffrement au repos des champs les plus sensibles (KYC) ─────────────────
// AES-256-GCM (chiffrement authentifié — détecte toute altération du contenu
// chiffré, contrairement à un simple AES-CBC). Ajouté le 2026-07-16 suite à
// l'audit qui a révélé que les photos de pièce d'identité, le numéro de
// document et le permis de conduire étaient stockés en clair dans MongoDB.
//
// Format stocké : "enc:v1:<iv hex>:<authTag hex>:<ciphertext hex>" — le
// préfixe "enc:v1:" permet à isEncrypted() de distinguer une valeur déjà
// chiffrée d'une valeur legacy en clair, indispensable pour une migration
// sans interruption (voir scripts/encryptExistingKycData — exécuté une fois
// en production le 2026-07-16) et pour ne jamais re-chiffrer une valeur qui
// l'est déjà (idempotence du hook pre-save).
const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function getKey() {
  const keyHex = process.env.FIELD_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("FIELD_ENCRYPTION_KEY manquante — impossible de chiffrer/déchiffrer les données sensibles.");
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY doit faire 32 octets (64 caractères hex).");
  }
  return key;
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

// ── Index déterministe pour recherche exacte (ex. détection de doublon) ──────
// AES-GCM utilise un IV aléatoire : chiffrer deux fois la même valeur produit
// deux résultats différents, donc une recherche par égalité sur un champ
// chiffré est structurellement impossible. Pour les champs qui doivent rester
// cherchables par égalité (numéro de document — détection de doublon KYC),
// on stocke en plus un HMAC-SHA256 déterministe (jamais réversible, contrairement
// au chiffrement) dérivé de la même clé — voir kycController.submitKyc.
export function hmacIndex(value) {
  if (value == null || value === "") return null;
  const key = getKey();
  return crypto.createHmac("sha256", key).update(String(value).trim().toLowerCase()).digest("hex");
}

// Chiffre une valeur — no-op sur null/undefined/chaîne vide (évite de stocker
// un blob chiffré pour "pas de valeur", et idempotent si déjà chiffrée.
export function encryptField(value) {
  if (value == null || value === "") return value;
  if (isEncrypted(value)) return value; // déjà chiffrée — ne jamais double-chiffrer
  const iv = crypto.randomBytes(12); // 96 bits, recommandé pour GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

// Déchiffre — renvoie la valeur telle quelle si elle n'est pas chiffrée (donnée
// legacy pas encore migrée, ou valeur vide) : ne jamais planter l'affichage
// d'un dossier KYC à cause d'une donnée pas encore migrée.
export function decryptField(value) {
  if (value == null || value === "") return value;
  if (!isEncrypted(value)) return value;
  try {
    const [ivHex, authTagHex, ciphertextHex] = value.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null; // corrompu ou mauvaise clé — ne jamais renvoyer un blob chiffré brut au frontend
  }
}
