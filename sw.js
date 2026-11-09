// Service worker: wszystko w cache po pierwszym wczytaniu -> działa bez sieci. Zmień VERSION, żeby wymusić odświeżenie.
// WAŻNE: pliki nowej wersji pobieramy z pominięciem pamięci HTTP przeglądarki (cache: 'reload'). GitHub Pages pozwala
// trzymać pliki 10 min (max-age=600); bez tego nowa wersja zapisywała u siebie STARY app.js (11-09: telefon utknął na 0.6.0).
const VERSION = 'vegas-skaner-v0.7.1';
const FILES = [
  './', 'index.html', 'app.js', 'parser.js', 'preprocess.js', 'ocr.js', 'store.js', 'lengthpass.js', 'skus.json', 'mapping.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'vendor/tesseract/tesseract.esm.min.js', 'vendor/tesseract/worker.min.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/lang/eng.traineddata.gz',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // version.json zawsze z sieci (sprawdzanie aktualizacji); bez sieci -> błąd, aplikacja to obsłuży
  if (new URL(e.request.url).pathname.endsWith('/version.json')) { e.respondWith(fetch(e.request, { cache: 'no-store' })); return; }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => { if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return res; })));
});
