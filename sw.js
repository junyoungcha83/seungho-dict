// 승호의사전 오프라인 캐시. 캐시명 바꾸면 옛 캐시 자동 폐기.
const CACHE = 'seungho-dict-v20';
const ASSETS = [
  './', './index.html', './assets/app.css', './assets/app.js', './assets/word.js',
  './assets/stats.js', './assets/essential.js', './assets/dict-bg.svg',
  './assets/splash.js', './assets/splash.jpg', './assets/gaegu-title.woff2',
  './manifest.webmanifest', './assets/icon.svg',
  './data/enko.json', './data/koen.json', './data/idioms.json',
  './data/ipa.json', './data/ipa_us.json', './data/ipa_uk.json', './data/examples.json',
  // 품사별 뜻·활용형·단어정보·퀴즈 재료 — 오프라인에서도 다 보여야 한다
  './data/core.json', './data/pos.json', './data/inflect.json', './data/wordinfo.json', './data/level.json', './data/gloss.json',
];
// 한 파일이 없어도(예: 아직 안 넣은 splash.jpg) 나머지 캐시는 살아 있어야 하므로 항목별로 담는다.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
      .catch(() => {})
  );
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
