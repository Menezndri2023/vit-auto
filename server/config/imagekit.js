import ImageKit from "imagekit";
import logger from "../utils/logger.js";

let _ik = null;

function getIK() {
  if (_ik) return _ik;
  const { IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT } = process.env;
  if (!IMAGEKIT_PUBLIC_KEY || !IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
    return null;
  }
  _ik = new ImageKit({
    publicKey:   IMAGEKIT_PUBLIC_KEY,
    privateKey:  IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: IMAGEKIT_URL_ENDPOINT,
  });
  logger.info("ImageKit initialisé", { endpoint: IMAGEKIT_URL_ENDPOINT });
  return _ik;
}

export const FOLDERS = {
  vehicles:  "vit-auto/vehicles",
  kyc:       "vit-auto/kyc",
  partners:  "vit-auto/partners",
  invoices:  "vit-auto/invoices",
  contracts: "vit-auto/contracts",
  avatars:   "vit-auto/avatars",
  showrooms: "vit-auto/showrooms",
  // Activités de loisir (plongée, quad, jetski…) — voir models/Activity.js.
  // Leurs photos partaient jusqu'ici dans "vit-auto/vehicles", faute de dossier
  // dédié : le défaut de uploadBase64Images. Aucune donnée à reprendre, la
  // collection était vide au moment de la correction.
  activities: "vit-auto/activities",
  docs:      "vit-auto/docs",
  drivers:   "vit-auto/drivers",
  // Sous-dossier SÉPARÉ pour les pièces d'identité et permis des chauffeurs.
  // "vit-auto/drivers" contient aussi du contenu délibérément PUBLIC — photo de
  // profil, images du véhicule, et surtout le CV, que le client consulte avant
  // de réserver (DriverBooking.jsx) et que l'admin ouvre en modération. Rendre
  // tout le dossier privé cassait ce CV pour chaque nouveau chauffeur, sans
  // aucune erreur visible. Le sensible vit donc dans son propre sous-dossier.
  driverDocs: "vit-auto/drivers/identity",
  bookingDocs: "vit-auto/booking-docs",
};

// Largeur maximale à laquelle une image d'affichage est STOCKÉE.
//
// Au-delà d'environ 25 mégapixels, ImageKit accepte le fichier mais REFUSE de
// le livrer : la page reçoit un 400 « Bad Request » à la place de la photo, sans
// la moindre erreur côté serveur — l'annonce paraît simplement cassée. Le piège
// est double, car un fichier de 27 MP peut ne peser qu'un mégaoctet et demi :
// aucun plafond exprimé en octets ne l'arrête. Constaté en production sur deux
// photos d'un partenaire (4872×5568).
//
// 2560 px suffit largement au plus grand affichage de la plateforme, et la
// transformation `pre` s'applique AVANT stockage : l'original démesuré n'est
// jamais conservé. Un appelant qui fournit sa propre transformation garde la
// main — elle remplace celle-ci.
//
// `c-at_max` est indispensable et n'est pas un détail de confort : avec le seul
// `w-2560`, ImageKit AGRANDIT les images plus petites que la cible. Une vignette
// de 500 px se retrouvait stockée en 2560 px — 429 Ko au lieu de 53, et floue.
// `c-at_max` borne sans jamais agrandir.
const MAX_LARGEUR_STOCKAGE = 2560;
const PRE_REDIMENSION = `w-${MAX_LARGEUR_STOCKAGE},c-at_max`;

export async function uploadImage(source, options = {}) {
  const ik = getIK();
  if (!ik) return null;
  try {
    const { folder = FOLDERS.vehicles, fileName, tags = [], transformation } = options;
    const payload = {
      file: source,
      fileName: fileName || `img_${Date.now()}`,
      folder,
      useUniqueFileName: true,
      transformation: transformation || { pre: PRE_REDIMENSION },
    };
    if (tags.length) payload.tags = tags;
    const result = await ik.upload(payload);
    return {
      url:          result.url,
      fileId:       result.fileId,
      name:         result.name,
      filePath:     result.filePath,
      thumbnailUrl: result.thumbnailUrl,
      width:        result.width,
      height:       result.height,
      size:         result.size,
    };
  } catch (err) {
    logger.error("ImageKit uploadImage", { error: err.message });
    return null;
  }
}

// Dossiers contenant des PIÈCES D'IDENTITÉ : pièce d'identité, permis, selfie,
// documents joints à une réservation, documents des chauffeurs. Les fichiers y
// sont déposés en PRIVÉ (audit sécurité 2026-09) : ils étaient jusqu'ici
// publics par défaut, si bien qu'une URL ayant fuité par un canal ordinaire
// (historique de navigateur, en-tête Referer, capture d'écran, journaux d'un
// proxy) restait une photo de carte d'identité téléchargeable sans
// authentification, indéfiniment — y compris après suppression du compte.
// Le caractère imprévisible du nom de fichier n'est pas un contrôle d'accès.
// `FOLDERS.drivers` est volontairement ABSENT de cette liste : il contient du
// contenu public (photo de profil, images du véhicule, CV). Seul son
// sous-dossier `driverDocs` est privé — voir le commentaire sur FOLDERS.
const PRIVATE_FOLDERS = [FOLDERS.kyc, FOLDERS.docs, FOLDERS.driverDocs, FOLDERS.bookingDocs].filter(Boolean);

const isPrivateFolder = (folder) => PRIVATE_FOLDERS.some((f) => folder === f || String(folder).startsWith(`${f}/`));

// Exposé pour les tests : la frontière public/privé est une règle métier
// (le CV d'un chauffeur est public, sa pièce d'identité ne l'est pas), et une
// erreur de classement casse silencieusement une page publique.
export const isPrivateFolderForTest = isPrivateFolder;

// Durée de validité d'une URL signée. Assez longue pour consulter et
// télécharger un document dans la foulée, assez courte pour qu'une URL ayant
// fuité ne serve plus.
const SIGNED_URL_TTL_SECONDS = 15 * 60;

// Rend affichable une URL de document. Un fichier PRIVÉ n'est lisible que via
// une URL signée ; un fichier public (déposé avant ce changement) traverse la
// signature sans dommage. Appelée au moment de la LECTURE, jamais stockée :
// une URL signée expire, elle n'a pas vocation à vivre en base.
export function signedDocumentUrl(url) {
  if (!url || typeof url !== "string") return url;
  const ik = getIK();
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  // Data URI, URL externe, ou ImageKit non configuré : rien à signer.
  if (!ik || !endpoint || !url.startsWith(endpoint)) return url;
  try {
    return ik.url({ src: url, signed: true, expireSeconds: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    logger.error("ImageKit signedDocumentUrl", { error: err.message });
    return url; // ne jamais faire disparaître un document à cause d'une erreur de signature
  }
}

export async function uploadDocument(source, folder = FOLDERS.kyc, fileName = null) {
  const ik = getIK();
  if (!ik) return null;
  try {
    const result = await ik.upload({
      file: source,
      fileName: fileName || `doc_${Date.now()}`,
      folder,
      useUniqueFileName: true,
      // Pièces d'identité : jamais accessibles sans URL signée.
      ...(isPrivateFolder(folder) ? { isPrivateFile: true } : {}),
    });
    return { url: result.url, fileId: result.fileId, name: result.name, filePath: result.filePath };
  } catch (err) {
    logger.error("ImageKit uploadDocument", { error: err.message });
    return null;
  }
}

export async function deleteMedia(fileId) {
  const ik = getIK();
  if (!ik || !fileId) return false;
  try {
    await ik.deleteFile(fileId);
    return true;
  } catch (err) {
    logger.error("ImageKit deleteMedia", { error: err.message, fileId });
    return false;
  }
}

export function getOptimizedUrl(src, opts = {}) {
  const ik = getIK();
  if (!ik || !src) return src;
  const { width, height, quality = "auto", format = "auto", crop } = opts;
  const tr = [];
  if (width)  tr.push({ width });
  if (height) tr.push({ height });
  if (crop)   tr.push({ crop });
  tr.push({ quality }, { format });
  return ik.url({ src, transformation: tr });
}

export function isAvailable() {
  return !!getIK();
}

// ── Convertit des images base64 (data URI) en URLs ImageKit hébergées ────────
// Bug réel corrigé (audit performance) : les annonces véhicule stockaient les
// photos en base64 BRUT dans MongoDB (validateVehicleImages acceptait déjà les
// deux formats, mais rien ne convertissait jamais le base64 reçu — le flux
// "upload ImageKit" documenté dans les commentaires n'était en réalité jamais
// déclenché). Conséquence mesurée en production : /api/vehicles?limit=20
// pesait 1,37 Mo (quasi entièrement des photos en base64), retransmis en
// entier à CHAQUE chargement du catalogue, jamais mis en cache par le
// navigateur (contrairement à une URL d'image classique). Convertit chaque
// entrée base64 en URL ImageKit hébergée ; une URL déjà présente ou un échec
// d'upload individuel sont conservés tels quels (jamais bloquant pour la
// création/modification d'une annonce — dégradation gracieuse, comme le reste
// des intégrations ImageKit du projet).
// Permet aux migrations de savoir si une conversion est réellement possible :
// sans identifiants, uploadBase64Images/Document renvoient l'entrée INCHANGÉE
// (dégradation gracieuse voulue à l'usage courant), ce qui faisait passer une
// migration pour « réussie » alors qu'elle n'avait rien converti — et
// runOnceMigration ne la rejouait alors JAMAIS.
export function isImageKitConfigured() {
  return !!getIK();
}

export async function uploadBase64Images(images, folder = FOLDERS.vehicles) {
  if (!Array.isArray(images) || !images.length) return images;
  const ik = getIK();
  if (!ik) return images;
  return Promise.all(images.map(async (img) => {
    if (typeof img !== "string" || !img.startsWith("data:")) return img;
    const result = await uploadImage(img, { folder });
    return result?.url || img;
  }));
}

// ── Même correctif que uploadBase64Images, pour un document unique (CV
// chauffeur PDF/image) — bug réel corrigé : un data URI base64 stocké tel
// quel comme href d'un <a target="_blank"> est bloqué par les navigateurs
// modernes ("Not allowed to navigate top frame to data URL"), le lien "Voir
// le CV" ne s'ouvrait donc jamais nulle part où il apparaît (DriverBooking,
// VendorDashboard, AdminPanel). Convertit en URL ImageKit hébergée, qu'un
// navigateur ouvre normalement dans un nouvel onglet.
export async function uploadBase64Document(doc, folder = FOLDERS.docs) {
  if (typeof doc !== "string" || !doc.startsWith("data:")) return doc;
  const result = await uploadDocument(doc, folder);
  return result?.url || doc;
}
