/* Tunanepal service worker with Firebase Cloud Messaging.

   Strategy: network first, cache as the safety net.
   Push notifications: Firebase Cloud Messaging handles push events. */

const CACHE = 'tuna-v29';

const SHELL = [
  './', './index.html', './manifest.json',
  './tokens.css', './base.css', './screens.css',
  './config.js', './api.js', './ui.js', './session.js', './auth.js',
  './home.js', './load.js', './customs.js', './games.js', './tourney.js',
  './settings.js', './chat.js', './ranks.js', './install.js', './main.js',
  './notifications.js',
  './icon-192.png', './logo.png', './favicon.ico'
];

self.addEventListener('install', (e) => {
  console.log('[SW] Installing');
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] Install error:', err);
        self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (e) => {
  console.log('[SW] Activating');
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
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.hostname.endsWith('googleapis.com')) return;
  if (url.hostname.endsWith('gstatic.com')) return;
  if (url.origin !== location.origin) return;

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
  console.log('[SW] Push received:', e.data);
  
  if (!e.data) {
    console.log('[SW] No data in push');
    return;
  }

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { 
      notification: { 
        title: 'Tunanepal', 
        body: e.data.text() 
      } 
    };
  }

  console.log('[SW] Payload:', payload);

  const { notification, data } = payload;
  if (!notification) {
    console.log('[SW] No notification in payload');
    return;
  }

  const opts = {
    icon: './icon-192.png',
    badge: './logo.png',
    tag: data?.tag || 'tuna',
    requireInteraction: false,
    data: data || {}
  };

  e.waitUntil(
    self.registration.showNotification(notification.title, {
      ...opts,
      body: notification.body
    }).then(() => {
      console.log('[SW] Notification shown');
    }).catch((err) => {
      console.error('[SW] Show notification error:', err);
    })
  );
});

/* Click a notification: focus the window or open the app. */
self.addEventListener('notificationclick', (e) => {
  console.log('[SW] Notification clicked');
  e.notification.close();

  const url = e.notification.data?.url || './';

  e.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then((clients) => {
        for (let client of clients) {
          if (client.url === new URL(url, self.location).href && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
