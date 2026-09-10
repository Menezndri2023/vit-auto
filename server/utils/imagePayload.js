// ── Images encodées dans le document ────────────────────────────────────────
// Une image en base64 (`data:image/...`) stockée dans un document pèse des
// centaines de kilo-octets. Une par annonce suffit à faire d'une page de liste
// plusieurs mégaoctets : c'est ce qui a mis le catalogue Import/Export en 500
// pendant une journée (voir scripts/migrateIEPhotosToImageKit.mjs).
//
// Les chemins de création convertissent normalement ces images en URL ImageKit,
// mais la conversion est VOLONTAIREMENT non bloquante : si ImageKit est
// indisponible, l'annonce est publiée avec son base64 plutôt que refusée. Ces
// helpers sont le filet de sécurité correspondant, côté lecture.
export const estImageEncodee = (v) => typeof v === "string" && v.startsWith("data:");

// Renvoie l'image si elle est légère (une URL), sinon rien. Une annonce dont
// l'image n'a jamais atteint ImageKit s'affiche alors avec le visuel de
// remplacement — elle seule est dégradée, au lieu de faire tomber la page
// entière pour tous les visiteurs.
export const imageLegereOuRien = (v) => (estImageEncodee(v) ? null : v || null);
