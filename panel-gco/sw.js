// GCO Control — Service Worker PWA (scope: /panel-gco/)
// Seguridad Ley N° 19.628: NUNCA cachea respuestas de Supabase ni de Google Apps Script.
const CACHE_NAME = "gco-panel-shell-20261124184658";
const SHELL_ASSETS = [
  "/panel-gco/",
  "/panel-gco/manifest.json",
  "/panel-gco/logo.png",
  "/panel-gco/icon-192.png",
  "/panel-gco/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca interceptar ni cachear llamadas privadas a Supabase, Apps Script o dominios externos
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("script.google.com")
  ) {
    return;
  }

  // Static Next.js hashed assets & icons: Cache-First
  if (
    url.pathname.includes("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // HTML / navigation: Network-First con fallback a caché para arranque rápido
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("/panel-gco/")))
  );
});
