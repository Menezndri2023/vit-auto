// VIT AUTO — Service Worker v2.0
const CACHE_NAME    = 'vit-auto-v2';
const STATIC_ASSETS = [
  '/manifest.json',
];

// Installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activation : nettoyage de TOUS les anciens caches (y compris v1)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch : Network First pour tout — jamais de cache pour JS/CSS (Vite gère déjà le cache-busting)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne jamais intercepter les requêtes API ni les modules Vite (/@, /src, ?v=)
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/@')) return;
  if (url.pathname.startsWith('/src/')) return;
  if (url.searchParams.has('v')) return;
  if (url.searchParams.has('t')) return;

  // JS et CSS → toujours réseau (Vite gère le cache-busting avec ?v=hash)
  if (request.destination === 'script' || request.destination === 'style') return;

  // Images → Cache First avec mise à jour en arrière-plan
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Navigation (HTML) → Network First avec fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }
});

// Push notifications (pour futures notifications push natives)
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
