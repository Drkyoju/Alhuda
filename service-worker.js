// Alhuda service worker — version-pinned cache, SWR for JS,
// cache-first static assets, navigation fallback, atomic-addAll-safe install.
//
// VERSION HANDSHAKE: a new SW installs in the background but does NOT call
// skipWaiting() until the page sends `postMessage('SKIP_WAITING')`. This
// prevents the new JS from activating while an old HTML tab is still running,
// which previously could throw on renamed functions. enhancements.js triggers
// the message on next page load so users get the update on the NEXT visit.

const CACHE = 'alhuda-v103';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './citation-canonical.js',
  './question-verse-map.js',
  './ayah-snippet-map.js',
  './speech-diacritics-map.js',
  './demo-questions-bundle.js',
  './version.js',
  './app.js',
  './auth.js',
  './platform.js',
  './enhancements.js',
  './fonts.css',
  './styles.css',
  './kids-ui.css',
  './enhancements.css',
  './icons/icon.svg',
  './icons/org-logo.png',
  './icons/org-logo-96.webp',
  './icons/org-logo-220.webp',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/tajawal-arabic-400-normal.woff2',
  './fonts/tajawal-arabic-700-normal.woff2',
  './fonts/tajawal-arabic-800-normal.woff2',
  './fonts/amiri-arabic-400-normal.woff2',
  './fonts/amiri-arabic-700-normal.woff2',
];

// Single shared version string. enhancements.js must keep its registration
// query `?v=` in sync with this constant.
const VERSION = 'v13';

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const results = await Promise.allSettled(ASSETS.map((a) => cache.add(a)));
      const failed = results
        .map((r, i) => (r.status === 'rejected' ? ASSETS[i] : null))
        .filter(Boolean);
      if (failed.length) {
        console.warn('[SW] Some precache assets failed:', failed);
      }
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isStaticAppFile(url) {
  return url.origin === self.origin && /\.(html|json|jpeg|jpg|svg|png|webp|css)$/i.test(url.pathname);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const networkPromise = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone());
        // Also store without query so install precache paths hit.
        try {
          const bare = new URL(request.url);
          bare.search = '';
          cache.put(bare.toString(), res.clone());
        } catch (e) {}
      }
      return res;
    })
    .catch(() => null);
  if (cached) {
    void networkPromise;
    return cached;
  }
  const net = await networkPromise;
  if (net) return net;
  throw new Error('offline and uncached');
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin.includes('supabase.co')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // JS: stale-while-revalidate — fast repeat visits, still update in background.
  if (url.origin === self.origin && /\.js$/i.test(url.pathname)) {
    e.respondWith(
      staleWhileRevalidate(e.request).catch(() => caches.match(e.request).then((r) => r || fetch(e.request)))
    );
    return;
  }

  if (isStaticAppFile(url)) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
  }
});
