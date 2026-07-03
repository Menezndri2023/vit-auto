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

export function getAuthToken() {
  const ik = getIK();
  if (!ik) return null;
  return ik.getAuthenticationParameters();
}

export function isAvailable() {
  return !!getIK();
}
