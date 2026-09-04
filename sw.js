// LME Autopilot — Service Worker
// Enables PWA installation + basic offline support for app shell.

const CACHE_VERSION = 'lme-20260904.1650';
const APP_SHELL = [
  '/',
  '/index.html',
  '/no.html',
  '/en.html',
  '/installer.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/SassoonMontessori.woff2',
  '/fonts/SassoonMontessori.woff2',
  '/SassoonMontessori.ttf',
  '/lme-pricing.js',
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

  // Nathalie AI-widgeten endres ofte under feilretting (samme grunn som no-store i
  // _headers). Cache-first her betyr at CACHE_VERSION ma bumpes manuelt for hver eneste
  // endring, ellers sitter alle igjen med den gamle, ufiksede filen pa ubestemt tid, selv
  // etter en frisk utrulling og hard refresh. Nettverk-forst her fjerner det problemet helt.
  const isFrequentlyEdited = url.pathname === '/lme-bot-core.js' ||
                              url.pathname === '/lme-bot-shell-content-studio.js';

  if (isHTML || isFrequentlyEdited) {
    /* cache:'reload' gaar utenom nettleserens eget HTTP-mellomlager. Uten den
       kan "nettverk foerst" likevel fa en gammel kopi derfra, og den
       installerte appen blir staaende paa en utgave som ikke finnes lenger. */
    event.respondWith(
      fetch(req, { cache: 'reload' })
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
