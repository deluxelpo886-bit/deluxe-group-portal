/* Service worker for the Deluxe Operations portal.
 *
 * Makes the whole portal installable on phones (own icon, full-screen) and load
 * fast. Network-first so updates are always picked up when online; falls back to
 * the cache only when offline. Live data and auth (/api/…) are never cached.
 */
const CACHE = 'deluxe-portal-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // let POSTs (login, saves) go straight through
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return; // never cache live data
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
