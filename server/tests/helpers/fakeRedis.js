// Fausse implémentation minimale d'un client Redis (sous-ensemble ioredis) —
// utilisée pour tester la révocation de token (tokenRevocation.js) sans
// dépendre d'un vrai Redis, absent en environnement de test (voir tests/setup.js,
// REDIS_URL vidée volontairement). Le TTL n'est pas réellement appliqué (les
// tests sont trop courts pour l'observer) — seule sa valeur passée à `set` est
// vérifiable via le mock.
export function createFakeRedisClient() {
  const store = new Map();
  return {
    store,
    set: async (key, value) => { store.set(key, value); return "OK"; },
    exists: async (key) => (store.has(key) ? 1 : 0),
  };
}
