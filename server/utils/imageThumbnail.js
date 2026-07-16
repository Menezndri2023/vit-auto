import { Jimp, JimpMime } from "jimp";

// ── Génère une vignette compressée à partir d'une image base64 (data URI) ────
// Miroir serveur de la compression client (VendorSubmit.jsx compressThumbnail)
// — nécessaire pour les véhicules publiés avant l'ajout de cette fonctionnalité
// (rattrapage, voir vehicleController.backfillThumbnails) et pour tout usage
// serveur futur qui n'a pas de canvas navigateur disponible.
//
// Jimp (pur JS, sans binaire natif) plutôt que sharp — plus lent, mais sans
// risque de build cassé sur un environnement de déploiement imprévu, pour un
// usage ponctuel (rattrapage) qui ne justifie pas ce risque.
export async function generateThumbnailFromDataUri(dataUri, { maxDimension = 480, quality = 60 } = {}) {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUri || "");
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  const img = await Jimp.read(buffer);
  if (img.width > maxDimension || img.height > maxDimension) {
    img.scaleToFit({ w: maxDimension, h: maxDimension });
  }
  const outBuffer = await img.getBuffer(JimpMime.jpeg, { quality });
  return `data:image/jpeg;base64,${outBuffer.toString("base64")}`;
}
