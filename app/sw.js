const CACHE_NAME = 'gco-app-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_ASSETS).catch(function () {
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  // Para consultas GET a Google Apps Script: Network-first con respaldo en caché
  if (url.indexOf('script.google.com') !== -1) {
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para archivos estáticos locales: Cache-first con actualización en segundo plano
  if (url.indexOf(self.location.origin) === 0) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        const fetchPromise = fetch(event.request)
          .then(function (networkResponse) {
            if (networkResponse && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(event.request, clone);
              });
            }
            return networkResponse;
          })
          .catch(function () {
            return cached;
          });
        return cached || fetchPromise;
      })
    );
  }
});
