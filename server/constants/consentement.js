// Consentements recueillis (2026-10-10) — dossier CNDP (loi 09-08) : la CNDP
// demande la copie du document de collecte du consentement, et un transfert
// vers un pays sans protection suffisante (États-Unis) repose sur le
// consentement EXPRÈS de la personne (art. 44). Changer un texte = changer la
// VERSION : chaque compte garde la version qu'il a acceptée, et ceux qui ont
// accepté une version antérieure sont invités à accepter la nouvelle.
// Miroir des libellés : src/i18n/connexion.js (consent.*), en 5 langues.
export const VERSION_CONSENTEMENT = "2026-10-10";

export const TEXTES_CONSENTEMENT = {
  cgu: "J'accepte les conditions générales d'utilisation et la politique de confidentialité de VIT AUTO.",
  transfert: "J'accepte que mes données soient hébergées et traitées hors du Maroc — en France, en Allemagne, au Royaume-Uni et aux États-Unis — par les prestataires techniques de VIT AUTO, comme décrit dans la politique de confidentialité.",
};

export const consentementComplet = (c) => c?.cgu === true && c?.transfert === true;

export const enregistrementConsentement = (req) => ({
  version: VERSION_CONSENTEMENT,
  cguLe: new Date(),
  transfertLe: new Date(),
  ip: String(req.ip || "").slice(0, 64) || null,
});
