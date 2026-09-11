import { signedDocumentUrl, isPrivateFolderForTest as estDossierPrive } from "../config/imagekit.js";

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE DES DOCUMENTS PRIVÉS À LA FRONTIÈRE DE LA RÉPONSE
// ═══════════════════════════════════════════════════════════════════════════
// Un fichier déposé dans un dossier PRIVÉ d'ImageKit (pièces d'identité,
// documents d'entreprise, pièces jointes de réservation) n'est lisible que par
// une URL signée, valable 15 minutes — voir config/imagekit.js.
//
// Jusqu'ici, seule la fiche de réservation signait ses documents. Les pièces
// d'identité, elles, étaient stockées en base64 DANS MongoDB : rien à signer,
// et cinq contrôleurs les renvoyaient telles quelles. Le jour où ces pièces
// sont migrées vers ImageKit — 43 Mo de base64 qui font échouer les tris et
// alourdissent chaque lecture —, chacun de ces contrôleurs renverrait une URL
// privée non signée : image vide pour l'administrateur, sans aucune erreur.
//
// Signer champ par champ dans chaque contrôleur serait fragile : les mêmes
// documents sont recopiés d'une collection à l'autre à l'affichage (la pièce
// d'identité KYC est recopiée dans le dossier de certification, dans la
// vérification partenaire, dans l'onboarding…). Un champ oublié = un document
// invisible, silencieusement.
//
// On signe donc à UN SEUL endroit : la réponse. Toute chaîne qui est une URL
// ImageKit sous un dossier privé est signée, où qu'elle se trouve dans la
// charge utile. Une URL publique n'est jamais touchée — `signedDocumentUrl`
// signerait tout ce qui est sur ImageKit, ce qui ajouterait une date
// d'expiration aux photos de véhicules.

const pointAcces = () => (process.env.IMAGEKIT_URL_ENDPOINT || "").replace(/\/$/, "");

// Une URL de fichier privé : sur notre point d'accès ImageKit ET sous un dossier
// privé. Le chemin est comparé sans le segment du point d'accès (`/vitauto`),
// que `filePath` côté ImageKit n'inclut pas non plus.
export function estUrlDocumentPrive(valeur) {
  if (typeof valeur !== "string" || valeur.length > 2048) return false;
  const base = pointAcces();
  if (!base || !valeur.startsWith(base + "/")) return false;
  const chemin = valeur.slice(base.length + 1).split("?")[0];
  const dossier = chemin.split("/").slice(0, -1).join("/");
  return dossier.length > 0 && estDossierPrive(dossier);
}

// Marqueurs qui permettent d'écarter en une seule recherche de sous-chaîne les
// réponses qui ne contiennent aucun document privé — l'immense majorité.
const MARQUEURS = ["/vit-auto/kyc/", "/vit-auto/docs/", "/vit-auto/drivers/identity/", "/vit-auto/booking-docs/"];

export function contientPeutEtreUnDocumentPrive(texte) {
  return typeof texte === "string" && MARQUEURS.some((m) => texte.includes(m));
}

// Parcourt une charge utile déjà sérialisable (objets, tableaux, chaînes) et
// remplace chaque URL de document privé par sa version signée. Ne modifie pas
// l'entrée ; les valeurs non concernées sont réutilisées telles quelles.
export function signerDocumentsDansPayload(valeur) {
  if (typeof valeur === "string") return estUrlDocumentPrive(valeur) ? signedDocumentUrl(valeur) : valeur;
  if (Array.isArray(valeur)) return valeur.map(signerDocumentsDansPayload);
  if (valeur && typeof valeur === "object") {
    const out = {};
    for (const [k, v] of Object.entries(valeur)) out[k] = signerDocumentsDansPayload(v);
    return out;
  }
  return valeur;
}

// Retire la signature d'une URL ImageKit (`ik-t`, `ik-s`) : une URL signée
// expire, elle ne doit JAMAIS être enregistrée. Or un formulaire d'édition
// renvoie ce qu'il a reçu — un document affiché puis sauvegardé sans
// modification reviendrait signé, et serait stocké avec une date d'expiration.
// Appliqué au corps des requêtes authentifiées, symétriquement à la signature
// appliquée aux réponses.
export function retirerSignature(valeur) {
  if (typeof valeur !== "string" || !valeur.includes("ik-s=")) return valeur;
  const base = pointAcces();
  if (!base || !valeur.startsWith(base + "/")) return valeur;
  try {
    const u = new URL(valeur);
    u.searchParams.delete("ik-t");
    u.searchParams.delete("ik-s");
    return u.search ? u.toString() : u.origin + u.pathname;
  } catch {
    return valeur;
  }
}

export function retirerSignaturesDansPayload(valeur) {
  if (typeof valeur === "string") return retirerSignature(valeur);
  if (Array.isArray(valeur)) return valeur.map(retirerSignaturesDansPayload);
  if (valeur && typeof valeur === "object") {
    for (const k of Object.keys(valeur)) valeur[k] = retirerSignaturesDansPayload(valeur[k]);
    return valeur;
  }
  return valeur;
}

// Middleware : signe les documents privés de chaque réponse JSON et retire
// les signatures du corps de chaque requête. À monter après `authenticate` —
// une route publique n'a aucune raison de renvoyer un document privé, et si
// elle le faisait, l'afficher serait le problème, pas la signature.
export function signerDocumentsPrives(req, res, next) {
  if (req.body && typeof req.body === "object") retirerSignaturesDansPayload(req.body);

  const jsonOriginal = res.json.bind(res);
  res.json = (payload) => {
    let texte;
    try { texte = JSON.stringify(payload); } catch { return jsonOriginal(payload); }
    if (!contientPeutEtreUnDocumentPrive(texte)) return jsonOriginal(payload);
    // Le passage par JSON normalise les documents Mongoose, ObjectId et dates
    // exactement comme `res.json` l'aurait fait : on signe sur cette forme.
    return jsonOriginal(signerDocumentsDansPayload(JSON.parse(texte)));
  };
  next();
}
