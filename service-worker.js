/* Service Worker HADIR
   v1.4.0 — 25 Ogos 2026

   PERUBAHAN PENTING berbanding versi sebelum ini:
   kod (.js/.css/.webmanifest) tidak lagi dihidangkan cache-first.

   Sebabnya: pada 25 Ogos 2026, `index.html` dikemas kini tetapi `app.js`
   dihidangkan dari cache kerana nombor versi pada URL tidak dinaikkan.
   Hasilnya HTML baharu berpasangan dengan JavaScript lama — aplikasi
   memaparkan "Cannot set properties of null" dan guru langsung tidak
   boleh log masuk.

   Bergantung pada manusia mengingati tiga nombor versi dalam tiga fail
   ialah reka bentuk yang rapuh. Sekarang kod diambil dari rangkaian
   dahulu; cache hanya menjadi sandaran bila internet tiada. Ikon kekal
   cache-first kerana ia besar dan tidak pernah berubah. */

const CACHE_VERSION = 'hadir-shell-v1.4.0-20260825-1';
const APP_SHELL = [
  './', './index.html', './styles.css?v=1.4.0', './config.js?v=1.4.0',
  './app.js?v=1.4.0', './manifest.webmanifest?v=1.4.0', './offline.html',
  './icons/hadir-192.png', './icons/hadir-512.png',
  './icons/hadir-maskable-512.png', './icons/apple-touch-icon.png',
  './icons/favicon-32.png', './icons/favicon-48.png'
];

/* Fail yang mengandungi kod. Satu versi lapuk di sini merosakkan
   keseluruhan aplikasi, jadi ia sentiasa disemak ke rangkaian dahulu. */
function failKod(url) {
  return /\.(js|css|webmanifest)(\?|$)/i.test(url.pathname + url.search);
}

/* `cache.addAll()` menolak keseluruhan janji jika SATU fail sahaja gagal
   diambil — satu ikon tersalah nama bermakna Service Worker langsung tidak
   dipasang, dan PWA mati senyap tanpa sebarang mesej. Setiap fail diambil
   berasingan supaya kegagalan satu tidak menjatuhkan yang lain. */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.all(
        APP_SHELL.map(u => cache.add(u).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('hadir-shell-') && key !== CACHE_VERSION)
        .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  /* Halaman: rangkaian dahulu, cache sebagai sandaran. */
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      const salin = res.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', salin));
      return res;
    }).catch(() => caches.match(req)
      .then(x => x || caches.match('./index.html'))
      .then(x => x || caches.match('./offline.html'))));
    return;
  }

  /* Kod: rangkaian dahulu. Salinan segar disimpan untuk kegunaan luar talian. */
  if (failKod(url)) {
    event.respondWith(fetch(req).then(res => {
      if (res && res.ok) {
        const salin = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(req, salin));
      }
      return res;
    }).catch(() => caches.match(req)));
    return;
  }

  /* Selebihnya (ikon, gambar): cache dahulu. */
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
