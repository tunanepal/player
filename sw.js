/* Tunanepal service worker.
   App shell is cached so the PWA opens instantly and survives a dead signal.
   Supabase calls always go to the network — stale points would be worse than
   an error message. */

const CACHE = 'tuna-v11';
const SHELL = [
  './', './index.html', './manifest.json',
  './tokens.css', './base.css', './screens.css',
  './config.js', './api.js', './ui.js',
  './session.js', './auth.js', './home.js', './load.js',
  './customs.js', './games.js', './settings.js', './tourney.js', './main.js',
  './icon-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;   // never cache live data

  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))));
});
