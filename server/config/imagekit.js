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
  docs:      "vit-auto/docs",
  drivers:   "vit-auto/drivers",
};

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
    };
    if (tags.length) payload.tags = tags;
    if (transformation) payload.transformation = transformation;
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

export async function uploadDocument(source, folder = FOLDERS.kyc, fileName = null) {
  const ik = getIK();
  if (!ik) return null;
  try {
    const result = await ik.upload({
      file: source,
      fileName: fileName || `doc_${Date.now()}`,
      folder,
      useUniqueFileName: true,
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
