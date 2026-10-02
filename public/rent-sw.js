/* Service worker for the public Deluxe rental site (/rent).
 * Makes it installable and fast. Network-first so updates show when online;
 * the enquiry POST (/api/enquiry) always goes straight to the network.
 */
const CACHE = 'deluxe-rent-v1';

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
  if (req.method !== 'GET') return; // let the enquiry POST through untouched
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;
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
