const CACHE_VERSION = 'hadir-shell-v1.2.0-20260824-2';
const APP_SHELL = [
  './', './index.html', './styles.css?v=1.2.0.2', './config.js?v=1.2.0.2',
  './app.js?v=1.2.0.2', './manifest.webmanifest?v=1.2.0.2', './offline.html',
  './icons/hadir-192.png', './icons/hadir-512.png',
  './icons/hadir-maskable-512.png', './icons/apple-touch-icon.png',
  './icons/favicon-32.png', './icons/favicon-48.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('hadir-shell-') && key !== CACHE_VERSION).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      const salin = res.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', salin));
      return res;
    }).catch(() => caches.match(req).then(x => x || caches.match('./index.html')).then(x => x || caches.match('./offline.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
