/**
 * VIT AUTO — Cache catalogue en mémoire (par processus)
 *
 * Volontairement PAS Redis : le catalogue est haute-lecture, faible-écriture,
 * et Redis (Upstash, quota limité — voir queue/connection.js) n'a pas besoin
 * d'une charge supplémentaire pour un cache que la latence/mémoire locale
 * suffit largement à couvrir. Une courte durée de vie (quelques dizaines de
 * secondes) tolère la légère fraîcheur perdue sans jamais nécessiter
 * d'invalidation explicite à chaque création/modification d'annonce.
 */
const store = new Map();
const MAX_ENTRIES = 500;

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 30_000) {
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Vide entièrement le cache. Sans elle, deux requêtes catalogue identiques
// séparées par un changement de données renvoient le même résultat pendant
// toute la durée de vie de l'entrée — acceptable en production (quelques
// dizaines de secondes de fraîcheur perdue, c'est le contrat), mais rend des
// tests successifs dépendants les uns des autres alors que la base, elle, est
// bien réinitialisée entre chaque.
export function cacheClear() {
  store.clear();
}

export function buildCacheKey(prefix, params) {
  const sorted = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${prefix}:${sorted}`;
}
