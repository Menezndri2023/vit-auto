// VIT AUTO — Service Worker v3.0
const CACHE_NAME    = 'vit-auto-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/@')) return;
  if (url.pathname.startsWith('/src/')) return;
  if (url.searchParams.has('v')) return;
  if (url.searchParams.has('t')) return;

  // JS/CSS avec hash Vite → toujours réseau
  if (request.destination === 'script' || request.destination === 'style') return;

  // Images → Stale-While-Revalidate
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

  // Navigation → Network First + mise en cache + fallback SPA
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(request)))
    );
    return;
  }

  // Fonts et autres ressources tierces → Cache First
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
