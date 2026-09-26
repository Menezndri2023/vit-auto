// ── Tarif par personne d'une activité, paliers de groupe compris ───────────
//
// Point de passage UNIQUE : le devis affiché au client et le montant
// réellement facturé doivent sortir du même calcul. Deux calculs finissent
// toujours par diverger, et c'est le client qui découvre l'écart au paiement.

/**
 * Le prix par personne effectif pour ce nombre de participants.
 *
 * Le palier retenu est le PLUS ÉLEVÉ qui reste atteint — « à partir de 10 »
 * l'emporte sur « à partir de 5 » quand douze personnes réservent. Les paliers
 * ne sont pas supposés triés : le partenaire les saisit dans l'ordre qui lui
 * vient, et un tri implicite serait une règle invisible de plus.
 *
 * Un palier ne s'applique QUE s'il baisse le prix. Un « tarif de groupe » plus
 * cher que le tarif normal est une erreur de saisie, jamais une intention :
 * l'appliquer ferait payer un groupe plus cher qu'une somme d'individus.
 */
export function prixParPersonne(activity, participants = 1) {
  const base = Number(activity?.price) || 0;
  if (activity?.priceUnit !== "per_person") return base;
  const n = Math.max(1, Math.floor(Number(participants) || 1));

  let retenu = null;
  for (const palier of activity?.tarifsGroupe || []) {
    const seuil = Number(palier?.aPartirDe);
    const prix  = Number(palier?.prixParPersonne);
    if (!Number.isFinite(seuil) || !Number.isFinite(prix)) continue;
    if (n < seuil || prix >= base) continue;
    if (!retenu || seuil > retenu.aPartirDe) retenu = { aPartirDe: seuil, prixParPersonne: prix };
  }
  return retenu ? retenu.prixParPersonne : base;
}

/** Le palier appliqué, pour l'afficher au client — ou `null`. */
export function palierApplique(activity, participants = 1) {
  const base = Number(activity?.price) || 0;
  const prix = prixParPersonne(activity, participants);
  if (prix === base) return null;
  const n = Math.max(1, Math.floor(Number(participants) || 1));
  const seuils = (activity?.tarifsGroupe || [])
    .filter((p) => n >= Number(p?.aPartirDe) && Number(p?.prixParPersonne) === prix)
    .map((p) => Number(p.aPartirDe));
  return { aPartirDe: Math.max(...seuils), prixParPersonne: prix, economieParPersonne: Math.round((base - prix) * 100) / 100 };
}
