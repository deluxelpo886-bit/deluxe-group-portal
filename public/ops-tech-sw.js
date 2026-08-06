// Service worker for the Deluxe Ops Technician app (scope: /ops/tech).
// Mirrors ops-sw.js but scoped to the technician install so the two apps cache
// independently. Never caches /api/* - job data must always be live.
var CACHE_NAME = 'deluxe-ops-tech-shell-v1';
var SHELL_FILES = [
  '/ops/tech',
  '/ops.js',
  '/ops.css',
  '/manifest-ops-tech.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(SHELL_FILES.map(function (f) {
      return cache.add(f).catch(function () { /* ignore individual miss */ });
    }));
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(fetch(event.request).catch(function () {
      return new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var networkFetch = fetch(event.request).then(function (response) {
        if (response && response.ok && event.request.method === 'GET') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || networkFetch;
    })
  );
});
