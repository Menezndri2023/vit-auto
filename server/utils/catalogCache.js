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

export function buildCacheKey(prefix, params) {
  const sorted = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${prefix}:${sorted}`;
}
