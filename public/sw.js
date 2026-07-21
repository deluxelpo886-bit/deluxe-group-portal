// Minimal service worker - just enough to make the app installable on phones.
// Deliberately does NOT cache /api/* responses: this app's data must always
// come from the live server so multiple devices stay in sync.
var CACHE_NAME = 'deluxe-portal-shell-v1';
var SHELL_FILES = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(SHELL_FILES); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n !== CACHE_NAME; }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var url = new URL(event.request.url);

  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(fetch(event.request).catch(function(){
      return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: {'Content-Type':'application/json'} });
    }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached){
      var networkFetch = fetch(event.request).then(function(response){
        if (response && response.ok) {
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, response.clone()); });
        }
        return response;
      }).catch(function(){ return cached; });
      return cached || networkFetch;
    })
  );
});
