/* Service worker for the Deluxe Fleet Live map (/fleet).
 *
 * Purpose: make /fleet installable on phones and load fast. It caches STATIC
 * ASSETS (leaflet, images, css) for speed, but it NEVER caches the HTML page
 * itself or the live data/login endpoints - those always come straight from the
 * network so you can never be shown a stale page (e.g. an old unit count).
 */
const CACHE = 'deluxe-fleet-v7';

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

  // The HTML page itself (any navigation, or anything asking for text/html):
  // ALWAYS go to the network so the page is never stale. Only fall back to a
  // cached copy if the network is genuinely unreachable (offline).
  const accept = req.headers.get('accept') || '';
  const isPage = req.mode === 'navigate' || accept.includes('text/html');
  if (isPage) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Everything else (static assets: leaflet, css, images): network-first, cache
  // the fresh copy, fall back to cache when offline.
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
