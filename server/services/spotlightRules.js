// ── Règles de mise en avant par pays — lecture, cache, plafond effectif ─────
// Voir models/SpotlightRules.js pour la règle ; ici son application.
import SpotlightRules from "../models/SpotlightRules.js";
import User from "../models/User.js";
import { clauseHorsComptesDeTest } from "../utils/comptesDeTest.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";

export const REGLE_PAR_DEFAUT = Object.freeze({ maxParPartenaire: 2, seuilPartenaires: 5 });
const TTL_MS = 60 * 1000;

export async function chargerRegles() {
  const cle = buildCacheKey("spotlight-regles", {});
  const enCache = cacheGet(cle);
  if (enCache) return enCache;
  const doc = await SpotlightRules.findById("regles").lean();
  const regles = {
    defaut: { ...REGLE_PAR_DEFAUT, ...(doc?.defaut || {}) },
    parPays: (doc?.parPays || []).map((p) => ({ country: String(p.country).toUpperCase(), maxParPartenaire: p.maxParPartenaire ?? doc?.defaut?.maxParPartenaire ?? REGLE_PAR_DEFAUT.maxParPartenaire, seuilPartenaires: p.seuilPartenaires ?? doc?.defaut?.seuilPartenaires ?? REGLE_PAR_DEFAUT.seuilPartenaires })),
  };
  cacheSet(cle, regles, TTL_MS);
  return regles;
}

export function reglePour(regles, country) {
  const code = country ? String(country).toUpperCase() : null;
  return (code && regles.parPays.find((p) => p.country === code)) || regles.defaut;
}

// Partenaires actifs d'un pays — hors comptes d'équipe et comptes de test.
export async function nbPartenairesActifs(country) {
  if (!country) return null;
  const cle = buildCacheKey("spotlight-partenaires", { country });
  const enCache = cacheGet(cle);
  if (enCache != null) return enCache;
  const horsTest = await clauseHorsComptesDeTest("_id");
  const n = await User.countDocuments({ role: "partenaire", isActive: true, teamOf: null, country: String(country).toUpperCase(), ...(horsTest || {}) });
  cacheSet(cle, n, TTL_MS);
  return n;
}

// Plafond effectif par partenaire pour une vitrine de `capacite` places.
//   ≥ seuil partenaires  → maxParPartenaire (2 par défaut) ;
//   entre 1 et le seuil  → assoupli, juste assez pour remplir la vitrine
//                          (ceil(capacité / nb), jamais sous maxParPartenaire) ;
//   0 partenaire         → vitrine internationale.
export function plafondEffectif(regle, nbPartenaires, capacite) {
  if (nbPartenaires === null) return { plafond: regle.maxParPartenaire, international: false };
  if (nbPartenaires <= 0) return { plafond: regle.maxParPartenaire, international: true };
  if (nbPartenaires >= regle.seuilPartenaires) return { plafond: regle.maxParPartenaire, international: false };
  return { plafond: Math.max(regle.maxParPartenaire, Math.ceil(capacite / nbPartenaires)), international: false };
}

export async function regleEffective(country, capacite) {
  const regles = await chargerRegles();
  const regle = reglePour(regles, country);
  const nbPartenaires = await nbPartenairesActifs(country);
  const { plafond, international } = plafondEffectif(regle, nbPartenaires, capacite);
  return { pays: country ? String(country).toUpperCase() : null, maxParPartenaire: regle.maxParPartenaire, seuilPartenaires: regle.seuilPartenaires, nbPartenaires, plafond, international };
}
