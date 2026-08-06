// Service worker for the Deluxe Ops installable app (scope: /ops).
// Caches the app shell so it opens instantly and survives a flaky connection,
// but NEVER caches /api/* - operations data must always come from the live
// server so technicians, ops heads and admins stay in sync.
var CACHE_NAME = 'deluxe-ops-shell-v1';
var SHELL_FILES = [
  '/ops',
  '/ops.js',
  '/ops.css',
  '/manifest-ops.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    // addAll fails the whole install if any file 404s; add individually so a
    // single miss never blocks the install.
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

  // Always go to the network for the API; fall back to a clear offline error.
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(fetch(event.request).catch(function () {
      return new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Shell: serve from cache first for instant loads, refresh in the background.
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
