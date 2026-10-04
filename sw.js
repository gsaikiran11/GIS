// /GIS/sw.js
const APP_PREFIX = 'GIS';
const VERSION = 'v1';
const CACHE_NAME = `${APP_PREFIX}${VERSION}`;

// Keep the precache minimal and resilient; add more known files as desired.
const PRECACHE = [
  '/GIS/',
  '/GIS/index.html',
  '/GIS/0. app.js',
  '/GIS/style.css'
];

// Install: add known essentials, but don't fail if some files are missing
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
    })
  );
  self.skipWaiting();
});

// Activate: cleanup older versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin: stale-while-revalidate for fast loads and updates
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Cross-origin (e.g., tile servers): try network, fall back to cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone())).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
