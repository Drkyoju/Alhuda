// Alhuda service worker — version-pinned cache, network-first JS,
// cache-first static assets, navigation fallback, atomic-addAll-safe install.
//
// VERSION HANDSHAKE: a new SW installs in the background but does NOT call
// skipWaiting() until the page sends `postMessage('SKIP_WAITING')`. This
// prevents the new JS from activating while an old HTML tab is still running,
// which previously could throw on renamed functions. enhancements.js triggers
// the message on next page load so users get the update on the NEXT visit.

const CACHE = 'alhuda-v32';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
];

// Single shared version string. enhancements.js must keep its registration
// query `?v=` in sync with this constant.
const VERSION = 'v10';

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (e) => {
  // Cache each asset individually with Promise.allSettled so that one missing
  // asset (e.g., a renamed image) doesn't reject the whole addAll and leave
  // the cache empty. The previous `c.addAll(...).catch(() => {})` swallowed
  // the failure silently and broke ALL offline support.
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const results = await Promise.allSettled(ASSETS.map((a) => cache.add(a)));
      const failed = results
        .map((r, i) => (r.status === 'rejected' ? ASSETS[i] : null))
        .filter(Boolean);
      if (failed.length) {
        // Don't throw — partial precache is still useful. Just log so it's
        // debuggable in DevTools → Application → Service Workers.
        console.warn('[SW] Some precache assets failed:', failed);
      }
    })()
  );
  // Do NOT skipWaiting() here — wait for the page's handshake (see top comment).
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never intercept Supabase API calls — they need real-time network.
  if (url.origin.includes('supabase.co')) return;

  // Navigation requests: try network, fall back to cached index.html so a
  // stale URL while offline shows the app shell instead of the browser's
  // raw "no internet" page.
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

  // JS: network-first so deploys apply immediately.
  if (url.origin === self.origin && /\.js$/i.test(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  if (!isStaticAppFile(url)) return;

  // Static assets: cache-first with background revalidation.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
