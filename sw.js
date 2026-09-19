/* Tunanepal service worker with Firebase Cloud Messaging.

   Strategy: network first, cache as the safety net.

   The old build served from cache first, which made the installed app show
   yesterday's version until it had been opened twice. Now the app asks the
   network for its own files, uses whatever comes back, and only falls back
   to the cached copy when there is no connection. Offline still works; a
   stale app no longer does.

   Supabase calls are never touched — stale points would be worse than an
   honest error.
   
   Push notifications: Firebase Cloud Messaging handles push events. When a
   message arrives, showNotification() displays it even if the app is closed.   */

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

/* ───────────────────────────────────────────────────── Firebase messages ── */

self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { notification: { title: 'Tunanepal', body: e.data.text() } };
  }

  const { notification, data } = payload;
  if (!notification) return;

  const opts = {
    icon: './icon-192.png',
    badge: './logo.png',
    tag: data?.tag || 'tuna',        // one notification per tag, updates instead of stacking
    requireInteraction: false,        // dismiss after a bit; set true for wagers
    data: data || {}
  };

  e.waitUntil(
    self.registration.showNotification(notification.title, {
      ...opts,
      body: notification.body
    })
  );
});

/* Click a notification: focus the window or open the app. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const url = e.notification.data?.url || './';

  e.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then((clients) => {
        // if the app tab is already open, focus it
        for (let client of clients) {
          if (client.url === new URL(url, self.location).href && 'focus' in client) {
            return client.focus();
          }
        }
        // otherwise, open a new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
