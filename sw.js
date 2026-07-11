const CACHE_NAME = 'noirsound-v8';
const ASSETS_TO_CACHE = [
  'index.html',
  'app.css',
  'app.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// Install event - Cache all core static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching Assets');
        // We use map and catch to avoid failing the install if icons are not created yet
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(asset => 
            cache.add(asset).catch(err => console.warn(`Failed to cache asset: ${asset}`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - Clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache first fallback to Network
self.addEventListener('fetch', (event) => {
  // Only intercept HTTP/S GET requests (skip chrome-extension, etc.)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fetch from network and dynamically cache new resources if needed
        return fetch(event.request)
          .then((response) => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Offline fallback (offline page or graceful error)
            return new Response('Offline connection unavailable.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
      })
  );
});
