/* Service worker for the Deluxe Fleet Live map (/fleet).
 *
 * Purpose: make /fleet installable on phones and load fast. It caches the page
 * shell (network-first, so updates are picked up when online) but NEVER caches
 * the live data or login endpoints - those always go straight to the network so
 * vehicle positions are always fresh.
 */
const CACHE = 'deluxe-fleet-v3';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // let POSTs (login) go straight through

  const url = new URL(req.url);

  // Live data + auth: always network, never cached.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // Everything else: network-first, fall back to cache when offline. Only
  // same-origin responses are cached (keeps it simple and avoids opaque caches).
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (url.origin === location.origin && resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
