// VIT AUTO — Service Worker v4.0
//
// ═══════════════════════════════════════════════════════════════════════════
// PANNE DU 2026-09-11 — PLUS AUCUNE IMAGE NE S'AFFICHAIT
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré sur la production, même page, même navigateur :
//   • service worker BLOQUÉ  → 8/8 images affichées, 0 échec réseau ;
//   • service worker ACTIF   → 2/8 images affichées, 37 252 requêtes en échec.
//
// Deux défauts, dans la branche « image » :
//
//  1. `.catch(() => cached)` renvoyait `undefined` quand rien n'était en cache.
//     `event.respondWith(undefined)` ne « laisse pas passer » la requête : il
//     la fait ÉCHOUER (net::ERR_FAILED). Une simple erreur de mise en cache
//     détruisait donc une réponse réseau parfaitement valide.
//
//  2. `cache.put()` n'était ni attendu ni protégé. Le stockage se remplit vite
//     avec des photos de 100 à 300 Ko ; au premier QuotaExceededError, la
//     promesse était rejetée, on retombait sur le défaut n° 1, et TOUTES les
//     images cessaient de s'afficher — d'un coup, sans rien changer au site.
//
// Règles retenues :
//   • une défaillance du cache ne doit JAMAIS dégrader une réponse réseau ;
//   • `respondWith` ne reçoit jamais `undefined` ;
//   • les images d'un autre domaine (CDN) ne sont plus interceptées du tout —
//     ImageKit les sert déjà avec `max-age=31536000`, et le cache HTTP du
//     navigateur fait ce travail mieux que nous, sans consommer le quota du
//     Cache Storage.
const CACHE_NAME    = 'vit-auto-v5';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  // `catch` sur l'ensemble : si UN seul fichier de la liste manque, `addAll`
  // rejette en bloc et le service worker ne s'installe jamais.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // La montée de version purge les caches précédents — dont celui, saturé, qui
  // a produit la panne.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .catch(() => {})
  );
  self.clients.claim();
});

// Met en cache sans jamais laisser l'échec remonter : le quota peut être plein,
// la réponse opaque, le stockage indisponible en navigation privée. Aucun de
// ces cas ne doit empêcher la ressource d'être servie.
function mettreEnCache(cache, request, response) {
  try {
    cache.put(request, response.clone()).catch(() => {});
  } catch { /* réponse non clonable ou stockage refusé */ }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch { return; }

  // Seules les requêtes GET sont cachables — un POST passé à `cache.put` lève.
  if (request.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/@')) return;
  if (url.pathname.startsWith('/src/')) return;
  if (url.searchParams.has('v')) return;
  if (url.searchParams.has('t')) return;

  // JS/CSS avec hash Vite → toujours réseau
  if (request.destination === 'script' || request.destination === 'style') return;

  if (request.destination === 'image') {
    // Images d'un AUTRE domaine (ImageKit, Unsplash) : jamais interceptées.
    // Elles arrivent avec un cache HTTP d'un an ; les recopier dans le Cache
    // Storage n'apporte rien et sature le quota — c'est ce qui a cassé la
    // production.
    if (url.origin !== self.location.origin) return;

    event.respondWith(
      caches.open(CACHE_NAME)
        .then((cache) => cache.match(request).then((cached) => {
          const reseau = fetch(request).then((response) => {
            if (response.ok) mettreEnCache(cache, request, response);
            return response;
          });
          // `cached || reseau` et jamais `undefined` : si le réseau échoue sans
          // copie en cache, on laisse l'échec RÉSEAU se produire, ce qui n'est
          // pas la même chose qu'un service worker qui casse la requête.
          return cached || reseau;
        }))
        // Toute défaillance du cache lui-même : on sert le réseau, sans filtre.
        .catch(() => fetch(request))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => mettreEnCache(cache, request, response)).catch(() => {});
          }
          return response;
        })
        // Hors ligne : on sert la coquille de l'application. `Response` de
        // repli explicite plutôt qu'`undefined`, qui ferait échouer la
        // navigation au lieu d'afficher quelque chose.
        .catch(() => caches.match('/')
          .then((r) => r || caches.match(request))
          .then((r) => r || new Response(
            '<!doctype html><meta charset="utf-8"><title>Hors ligne</title>'
            + '<p style="font-family:system-ui;padding:2rem">Connexion indisponible. Réessayez.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )))
    );
    return;
  }

  // Appels de données tiers (géolocalisation IP, géocodage inverse…) → JAMAIS
  // mis en cache. Ils tombaient jusqu'ici dans le "cache first" ci-dessous, qui
  // n'a ni expiration ni revalidation : un premier chargement derrière un VPN
  // (ou en déplacement) figeait DÉFINITIVEMENT le pays détecté, donc la devise
  // affichée et le filtrage du catalogue.
  if (request.destination === '' && url.origin !== self.location.origin) return;

  // Polices et autres ressources statiques tierces → Cache First
  event.respondWith(
    caches.match(request)
      .then((cached) => cached || fetch(request).then((response) => {
        if (response.ok && url.origin !== self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => mettreEnCache(cache, request, response)).catch(() => {});
        }
        return response;
      }))
      .catch(() => fetch(request))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }
  event.waitUntil(
    self.registration.showNotification(data.titre || 'VIT AUTO', {
      body:    data.message || '',
      icon:    '/icons/icon-192x192.png',
      badge:   '/icons/icon-72x72.png',
      data:    { url: data.lien || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
