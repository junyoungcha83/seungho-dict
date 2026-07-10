// 승호의사전 오프라인 캐시. 캐시명 바꾸면 옛 캐시 자동 폐기.
const CACHE = 'seungho-dict-v6';
const ASSETS = [
  './', './index.html', './assets/app.css', './assets/app.js',
  './manifest.webmanifest', './assets/icon.svg',
  './data/enko.json', './data/koen.json', './data/idioms.json',
  './data/ipa.json', './data/ipa_us.json', './data/ipa_uk.json', './data/examples.json',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Tatoeba 등 외부는 통과(캐시는 앱이 처리)
  e.respondWith(
    fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
