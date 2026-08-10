// Alhuda service worker — version-pinned cache, SWR for JS,
// cache-first static assets, navigation fallback, atomic-addAll-safe install.
//
// On install we skipWaiting() so players leave stale UI (e.g. old «شرح» block)
// without needing a manual toast tap. clients.claim() on activate.

const CACHE = 'alhuda-v321';
// Keep install precache lean — large speech-diacritics-map.js loads on demand.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './citation-canonical.js',
  './question-verse-map.js',
  './ayah-snippet-map.js',
  './speech-pronunciation-lexicon.js',
  './allah-irab.browser.js',
  './baked-tts.browser.js',
  './speech-diacritics-core.js',
  './questions-bank-v311.js',
  './version-v321.js',
  './app.js',
  './auth.js',
  './platform.js',
  './enhancements.js',
  './fonts.css',
  './styles.css',
  './kids-ui.css',
  './enhancements.css',
  './icons/icon.svg',
  './icons/org-logo-96.webp',
  './icons/org-logo-220.webp',
  './icons/icon-192.png',
  './fonts/tajawal-arabic-400-normal.woff2',
  './fonts/tajawal-arabic-700-normal.woff2',
];

const VERSION = 'v280';

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
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isStaticAppFile(url) {
  return url.origin === self.origin && /\.(html|json|jpeg|jpg|svg|png|webp|css)$/i.test(url.pathname);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  // Prefer exact URL (respects ?v= cache-bust).
  const cachedExact = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone());
        try {
          const bare = new URL(request.url);
          bare.search = '';
          cache.put(bare.toString(), res.clone());
        } catch (e) {}
      }
      return res;
    })
    .catch(() => null);
  if (cachedExact) {
    void networkPromise;
    return cachedExact;
  }
  // No exact pin — prefer network so ?v= bumps are not stuck on old ignoreSearch hits.
  const net = await networkPromise;
  if (net) return net;
  const cachedLoose = await cache.match(request, { ignoreSearch: true });
  if (cachedLoose) return cachedLoose;
  throw new Error('offline and uncached');
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin.includes('supabase.co')) return;

  // version.js / version-vN.js must be network-first so clients detect updates.
  if (url.origin === self.origin && /\/version(?:-v\d+)?\.js$/i.test(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./version.js')))
    );
    return;
  }

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

  if (url.origin === self.origin && /\.js$/i.test(url.pathname)) {
    // Version-pinned JS (?v=) is network-first so deploys show up without a manual cache wipe.
    const hasVersionPin = url.search.length > 1;
    if (hasVersionPin) {
      e.respondWith(
        fetch(e.request)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => {
                c.put(e.request, clone);
                try {
                  const bare = new URL(e.request.url);
                  bare.search = '';
                  c.put(bare.toString(), res.clone());
                } catch { /* ignore */ }
              });
            }
            return res;
          })
          .catch(() =>
            caches.match(e.request).then((r) => r || caches.match(e.request, { ignoreSearch: true }))
          )
      );
      return;
    }
    e.respondWith(
      staleWhileRevalidate(e.request).catch(() => caches.match(e.request).then((r) => r || fetch(e.request)))
    );
    return;
  }

  // Cache baked Yousef MP3s (and Quran audio) for offline demo / revisit.
  if (url.origin === self.origin && /\/tts-baked\/.+\.mp3$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) {
          const ctype = (hit.headers.get('content-type') || '').toLowerCase();
          if (ctype.includes('audio') || ctype.includes('mpeg') || ctype.includes('octet-stream')) {
            return hit;
          }
          // Drop poisoned HTML/SPA responses cached under an .mp3 URL.
          try { await cache.delete(e.request); } catch { /* ignore */ }
        }
        try {
          const res = await fetch(e.request, { cache: 'no-cache' });
          const ctype = (res.headers.get('content-type') || '').toLowerCase();
          if (res.ok && (ctype.includes('audio') || ctype.includes('mpeg') || ctype.includes('octet-stream'))) {
            cache.put(e.request, res.clone());
          }
          return res;
        } catch {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // Edge-proxied Hudhaify ayahs — cache for offline round replay.
  if (url.origin === self.origin && /\/api\/quran-audio$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) {
          const ctype = (hit.headers.get('content-type') || '').toLowerCase();
          const clen = Number(hit.headers.get('content-length') || 0);
          if (
            (ctype.includes('audio') || ctype.includes('mpeg') || ctype.includes('octet-stream'))
            && (clen === 0 || clen > 800)
          ) {
            return hit;
          }
          // Drop poisoned HTML / tiny bodies cached under quran-audio.
          try { await cache.delete(e.request); } catch { /* ignore */ }
        }
        try {
          const res = await fetch(e.request);
          const ctype = (res.headers.get('content-type') || '').toLowerCase();
          const clen = Number(res.headers.get('content-length') || 0);
          if (
            res.ok
            && (ctype.includes('audio') || ctype.includes('mpeg') || ctype.includes('octet-stream'))
            && (clen === 0 || clen > 800)
          ) {
            cache.put(e.request, res.clone());
          }
          return res;
        } catch {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  if (isStaticAppFile(url)) {
    // Versioned CSS/assets (?v=) must be network-first — cache-first + ignoreSearch
    // was sticky-serving old oversized mobile styles under a new query pin.
    const hasVersionPin = url.search.length > 1;
    if (hasVersionPin || /\.css$/i.test(url.pathname)) {
      e.respondWith(
        fetch(e.request)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => {
                c.put(e.request, clone);
                try {
                  const bare = new URL(e.request.url);
                  bare.search = '';
                  c.put(bare.toString(), res.clone());
                } catch { /* ignore */ }
              });
            }
            return res;
          })
          .catch(() =>
            caches.match(e.request).then((r) => r || caches.match(e.request, { ignoreSearch: true }))
          )
      );
      return;
    }
    e.respondWith(
      caches.match(e.request).then(async (exact) => {
        if (exact) return exact;
        const loose = await caches.match(e.request, { ignoreSearch: true });
        if (loose) return loose;
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
