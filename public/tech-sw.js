/* Service worker for the Deluxe Technician app.
 * Handles background push (new job) and notification taps. Scope: /tech.
 */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// A network-first fetch handler. Its presence also makes the app install-
// eligible (browsers require a service worker with a fetch handler), and it
// lets the shell load when briefly offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.indexOf('/api/') === 0) return; // never cache live data
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (url.origin === location.origin && resp && resp.ok) {
          const copy = resp.clone();
          caches.open('deluxe-tech-v1').then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});

// A new job arrives from the office -> show a notification even if the app is
// closed. Payload is JSON: { title, body, tag, url }.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: 'New job / नया काम', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'New job / नया काम';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'deluxe-job',
    renotify: true,
    vibrate: [200, 90, 200, 90, 200],
    requireInteraction: true,
    data: { url: data.url || '/tech' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification opens (or focuses) the technician app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/tech';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.indexOf('/tech') !== -1 && 'focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return null;
    })
  );
});
