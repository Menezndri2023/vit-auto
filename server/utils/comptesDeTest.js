// ── Comptes de test : résolution et exclusion des surfaces publiques ───────
//
// Ces comptes restent PLEINEMENT fonctionnels — ils resservent à d'autres
// tests. Ils ne doivent simplement apparaître nulle part côté visiteur.
//
// Deux sources, réunies ici : le drapeau `User.isTestAccount`, posé
// explicitement (script scripts/marquerComptesDeTest.mjs), et la détection par
// domaine réservé, qui couvre d'office tout compte créé par un futur script de
// test sans qu'on ait à repasser derrière.
//
// La liste se compte en dizaines : une requête suffit, et le résultat est mis
// en cache — ce chemin est traversé par la page d'accueil et le catalogue.
import User from "../models/User.js";
import { REGEX_EMAIL_DE_TEST } from "../constants/testAccounts.js";
import { cacheGet, cacheSet } from "./catalogCache.js";

const CLE_CACHE = "comptes-de-test";
const TTL_MS = 5 * 60 * 1000;

export const CLAUSE_COMPTE_DE_TEST = {
  $or: [{ isTestAccount: true }, { email: REGEX_EMAIL_DE_TEST }],
};

export async function idsComptesDeTest() {
  const enCache = cacheGet(CLE_CACHE);
  if (enCache) return enCache;
  const ids = (await User.find(CLAUSE_COMPTE_DE_TEST).select("_id").lean()).map((u) => u._id);
  cacheSet(CLE_CACHE, ids, TTL_MS);
  return ids;
}

// Clause à ajouter à un filtre public portant sur un champ « propriétaire ».
// Renvoie `null` quand il n'y a aucun compte de test — l'appelant évite alors
// d'ajouter une condition inutile à sa requête.
export async function clauseHorsComptesDeTest(champ = "owner") {
  const ids = await idsComptesDeTest();
  return ids.length ? { [champ]: { $nin: ids } } : null;
}
