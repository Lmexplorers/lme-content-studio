// LME Content Studio — Service Worker
// Enables PWA installation + basic offline support for app shell.

const CACHE_VERSION = 'lme-v83';
const APP_SHELL = [
  '/',
  '/index.html',
  '/no.html',
  '/en.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/SassoonMontessori.woff2',
  '/fonts/SassoonMontessori.woff2',
  '/SassoonMontessori.ttf',
  '/lme-bot-core.js',
  '/lme-bot-shell-content-studio.js'
];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Cache hver fil for seg, sa en enkelt 404 ikke velter hele precache-en.
      return Promise.all(APP_SHELL.map((url) =>
        fetch(url, { cache: 'reload' })
          .then((res) => { if (res && res.ok) return cache.put(url, res); })
          .catch(() => {})
      ));
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for HTML (so updates arrive), cache-first for everything else
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
  } else {
    event.respondWith(
      caches.match(req).then((cached) => {
        return cached || fetch(req).then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => cached);
      })
    );
  }
});
