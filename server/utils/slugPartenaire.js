// ── Adresse lisible d'un partenaire ────────────────────────────────────────
//
// Deux pages publiques nomment un partenaire par un slug : le showroom PMS
// (/showroom/:slug, réservé au palier Business) et, depuis le 2026-09-25, la
// vitrine partageable (/p/:slug, l'adresse que le partenaire imprime sur sa
// carte de visite). Les deux normalisaient le nom séparément.
//
// Une même entreprise obtenait donc deux adresses écrites différemment selon
// la page — « Rent à Car Côte d'Azur » n'a rien d'un cas limite ici : accents,
// espaces et apostrophes sont la règle dans ce catalogue, pas l'exception.
//
// Rien de neuf dans la normalisation : c'est celle de `slugDisponible` du
// contrôleur PMS, sortie telle quelle pour que les deux pages la partagent.

// Repli quand le nom n'est pas encore renseigné : un compte fraîchement créé
// n'a pas de raison sociale, mais son lien doit exister tout de suite — sinon
// le partenaire découvre une page morte le jour où il en a besoin.
export const slugDeRepli = (id) => `partenaire-${String(id || "").slice(-6)}`;

export function normaliserSlug(base, id) {
  return (base || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || slugDeRepli(id);
}

// Un slug unique dans `collection`, en suffixant -2, -3… tant qu'il est pris.
//
// `exclure` est l'identifiant du propriétaire légitime : sans lui, renommer un
// partenaire sans changer son nom lui attribuerait « nom-2 » parce qu'il se
// heurterait à SA PROPRE entrée.
export async function slugUnique(base, { collection, champ = "slug", proprietaire, exclure }) {
  const racine = normaliserSlug(base, proprietaire);
  let slug = racine;
  for (let i = 2; await collection.exists({ [champ]: slug, ...(exclure || {}) }); i++) slug = `${racine}-${i}`;
  return slug;
}

// Un slug ne doit jamais pouvoir être confondu avec un identifiant Mongo, sans
// quoi /p/<24 hexa> et /partner/<id> désigneraient deux choses selon la route.
export const ressembleAUnId = (v) => /^[0-9a-f]{24}$/i.test(String(v || "").trim());
