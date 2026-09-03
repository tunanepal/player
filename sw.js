/* Tunanepal service worker.

   Strategy: network first, cache as the safety net.

   The old build served from cache first, which made the installed app show
   yesterday's version until it had been opened twice. Now the app asks the
   network for its own files, uses whatever comes back, and only falls back
   to the cached copy when there is no connection. Offline still works; a
   stale app no longer does.

   Supabase calls are never touched — stale points would be worse than an
   honest error.                                                            */

const CACHE = 'tuna-v29';

const SHELL = [
  './', './index.html', './manifest.json',
  './tokens.css', './base.css', './screens.css',
  './config.js', './api.js', './ui.js', './session.js', './auth.js',
  './home.js', './load.js', './customs.js', './games.js', './tourney.js',
  './settings.js', './chat.js', './ranks.js', './install.js', './main.js',
  './icon-192.png', './logo.png', './favicon.ico'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())     // take over without waiting for tabs
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'tuna-updated', version: CACHE }));
      })
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'tuna-skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;   // live data, always
  if (url.origin !== location.origin) return;         // fonts and CDNs

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
