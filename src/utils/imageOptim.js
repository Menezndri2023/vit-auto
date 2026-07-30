// Redimensionne une image hébergée sur ImageKit via ses paramètres de
// transformation à la volée (voir server/config/imagekit.js pour l'upload
// correspondant côté serveur) — sans ça, une vignette de 200px de large
// téléchargeait la photo pleine résolution uploadée par le partenaire.
// Aucun effet sur une URL non-ImageKit (base64 legacy, autre CDN) : renvoyée
// telle quelle, jamais de transformation à l'aveugle sur une chaîne inconnue.
export function optimizedImageUrl(src, { width, quality = "auto" } = {}) {
  if (typeof src !== "string" || !src.includes("ik.imagekit.io")) return src;
  const params = [`q-${quality}`, "f-auto"];
  if (width) params.push(`w-${width}`);
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}tr=${params.join(",")}`;
}
