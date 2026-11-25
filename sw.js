const CACHE_NAME = 'pente-pwa-v5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/pente-logo.svg',
  './assets/friz-quadrata-std-webfont/friz-quadrata-std-medium-5870338ec7ef8.woff',
  './assets/friz-quadrata-std-webfont/friz-quadrata-std-bold-587034a220f9f.woff',
  './styles/app.css',
  './src/main.js',
  './src/app/PenteApp.js',
  './src/config/constants.js',
  './src/engine/PenteGame.js',
  './src/engine/PenteAI.js',
  './src/audio/SoundFX.js',
  './src/net/PeerSession.js',
  './src/state/ProfileStore.js',
  './src/ui/BoardRenderer.js',
  './src/ui/MentorCoach.js',
  './src/ui/ModalManager.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
