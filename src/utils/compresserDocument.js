// Lecture d'un justificatif choisi par l'utilisateur, prêt à envoyer (data URI).
//
// Pourquoi (2026-10-05) : les pages de justificatifs envoyaient la photo telle
// quelle. Une photo de téléphone récent pèse 4 à 15 Mo ; le serveur refuse
// au-delà de 6 Mo par document (« Document trop volumineux ») et de 20 Mo par
// envoi — le partenaire ne parvenait pas à mettre à jour ses documents.
//
// - Image : redimensionnée (2000 px sur le grand côté, assez pour lire une
//   pièce d'identité ou un registre de commerce) et réencodée en JPEG. Le
//   HEIC d'iPhone est converti quand le navigateur sait le lire (Safari) ;
//   sinon, message clair au lieu d'un « contenu invalide » côté serveur.
// - PDF : envoyé tel quel s'il tient sous la limite, sinon message clair.
const MAX_COTE = 2000;
const QUALITE = 0.85;
export const MAX_DOCUMENT_OCTETS = 6 * 1024 * 1024;

const lireDataUri = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error("Lecture du fichier impossible."));
  r.readAsDataURL(file);
});

const chargerImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("image illisible"));
  img.src = src;
});

const estHeic = (file) => /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || "");

// Retourne { name, data, type } ; lève une Error au message affichable.
export async function lireDocument(file, { maxOctets = MAX_DOCUMENT_OCTETS } = {}) {
  if (!file) throw new Error("Aucun fichier sélectionné.");
  const name = file.name || "document";

  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    if (file.size > maxOctets) {
      throw new Error(`Ce PDF pèse ${(file.size / 1048576).toFixed(1)} Mo (maximum ${Math.round(maxOctets / 1048576)} Mo). Envoyez plutôt une photo du document, ou un PDF compressé.`);
    }
    return { name, data: await lireDataUri(file), type: "pdf" };
  }

  if (!file.type.startsWith("image/") && !estHeic(file)) {
    throw new Error("Format non pris en charge : envoyez une photo (JPEG, PNG) ou un PDF.");
  }

  const source = await lireDataUri(file);
  let img;
  try {
    img = await chargerImage(source);
  } catch {
    if (estHeic(file)) {
      throw new Error("Photo au format HEIC (iPhone) non lisible par ce navigateur. Réglez l'appareil photo sur « Le plus compatible » ou envoyez la photo depuis Safari ou l'application.");
    }
    throw new Error("Image illisible : reprenez la photo ou choisissez un autre fichier.");
  }

  const echelle = Math.min(1, MAX_COTE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * echelle));
  canvas.height = Math.max(1, Math.round(img.height * echelle));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // PNG transparent → fond blanc, pas noir, en JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let data = canvas.toDataURL("image/jpeg", QUALITE);
  // Rare : image très détaillée encore trop lourde — une seconde passe plus compressée.
  if ((data.length * 3) / 4 > maxOctets) data = canvas.toDataURL("image/jpeg", 0.6);
  if ((data.length * 3) / 4 > maxOctets) throw new Error("Image trop lourde même après compression.");
  return { name: name.replace(/\.(heic|heif|png|webp)$/i, ".jpg"), data, type: "image" };
}
