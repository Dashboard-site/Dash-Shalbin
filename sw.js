/* ============================================================
   sw.js — Teacher's Dashboard Service Worker
   Strategy: Cache-first for all static assets.
             Network-first for the HTML shell (so updates
             reach the user, but offline still works).
   ============================================================ */

const CACHE_NAME   = 'teacherdash-v1';
const SHELL_URL    = './index.html';

/* Every file the app needs to work completely offline */
const PRECACHE = [
  './index.html',
  './manifest.json',
  './digital.woff2',
  './bg.png',
  './icon.png',
];

/* ── INSTALL — precache everything ────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Failed to precache ${url}:`, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE — remove old caches ─────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ─────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Only handle same-origin GET requests */
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  /* HTML shell → network-first (fresh on reload, offline fallback) */
  if (url.pathname.endsWith('mini-dashboard.html') || url.pathname === url.origin + '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  /* Everything else (fonts, images, manifest) → cache-first */
  event.respondWith(cacheFirst(request));
});

/* ── Strategies ────────────────────────────────────────────── */

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* Offline and not cached — return a minimal fallback */
    return new Response('Offline — asset not cached yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('<h2>You are offline</h2><p>Open the app at least once online to enable offline use.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

/* ── PUSH NOTIFICATIONS (period alerts) ───────────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: "Dashboard", body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Dashboard", {
      body:      payload.body  || "",
      icon:      './icon.png',
      badge:     './icon.png',
      tag:       payload.tag   || 'teacherdash-notif',
      renotify:  true,
      silent:    false,
    })
  );
});

/* ── NOTIFICATION CLICK — focus or open the app ───────────── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('mini-dashboard') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('./mini-dashboard.html');
    })
  );
});
