/* Self-destructing service worker.
 *
 * The old caching worker was serving stale copies of the fleet page. This
 * version does the opposite: when a browser picks it up it deletes all caches,
 * unregisters itself, and passes every request straight to the network. After
 * this runs once, the page always loads fresh from the server with no worker. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore */ }
    try { await self.registration.unregister(); } catch (_) { /* ignore */ }
    try { await self.clients.claim(); } catch (_) { /* ignore */ }
  })());
});

// Never cache anything; always go straight to the network.
self.addEventListener('fetch', () => { /* pass-through: no respondWith */ });
