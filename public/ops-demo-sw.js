// Service worker for the self-contained Deluxe Ops Demo (scope: /ops/demo).
// The demo has no backend, so we cache the whole shell for a true offline app.
var CACHE_NAME = 'deluxe-ops-demo-shell-v1';
var SHELL_FILES = [
  '/ops/demo', '/ops-demo.js', '/ops-demo.css', '/ops.css',
  '/manifest-ops-demo.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(SHELL_FILES.map(function (f) { return cache.add(f).catch(function () {}); }));
  }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  event.respondWith(caches.match(event.request).then(function (cached) {
    var net = fetch(event.request).then(function (response) {
      if (response && response.ok && event.request.method === 'GET') {
        var copy = response.clone(); caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    }).catch(function () { return cached; });
    return cached || net;
  }));
});
