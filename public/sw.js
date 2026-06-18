// VIT AUTO — Service Worker v3.0
const CACHE_NAME    = 'vit-auto-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

// Installation — mise en cache de l'app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activation — nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne jamais intercepter API ni modules Vite dev
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/@')) return;
  if (url.pathname.startsWith('/src/')) return;
  if (url.searchParams.has('v')) return;
  if (url.searchParams.has('t')) return;

  // JS et CSS avec hash → immutable, toujours réseau en premier
  if (request.destination === 'script' || request.destination === 'style') return;

  // Images → Stale-While-Revalidate (cache first + mise à jour en arrière-plan)
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Navigation (HTML) → Network First avec fallback sur '/'
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Mettre en cache la page si OK
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(request)))
    );
    return;
  }

  // Autres ressources (fonts, etc.) → Cache First
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && url.origin !== self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      });
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
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
