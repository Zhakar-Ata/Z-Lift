/* Z Lift — Service Worker (offline-first PWA)
   Strategy:
     • navigations  → network-first with a 4s timeout, fall back to the cached shell
       (guarantees a fresh app right after deploy, still works fully offline)
     • same-origin static assets & the fonts CDN → cache-first, refreshed in background
     • /api/ GETs → network-first, cached copy as offline fallback
   Bump CACHE on every release so old shells are evicted. */
const CACHE = 'zlift-pwa-v23';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];
const NAV_TIMEOUT = 4000;

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // never let one missing file abort the whole install
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  // only cache complete, basic/cors 200 responses (never partial 206 or opaque errors)
  if (!response || response.status !== 200 || response.type === 'opaqueredirect') return;
  const copy = response.clone();
  caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // writes always go to the network
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com';

  /* app shell: network-first so a new release shows up immediately */
  if (req.mode === 'navigate') {
    e.respondWith(
      Promise.race([
        fetch(req).then(res => { putInCache('./index.html', res); return res; }),
        new Promise(resolve => setTimeout(() => resolve(null), NAV_TIMEOUT))
      ])
        .then(res => res || caches.match('./index.html').then(hit => hit || fetch(req)))
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  /* API GETs: fresh data first, cached copy when offline */
  if (url.pathname.includes('/api/')) {
    e.respondWith(
      fetch(req)
        .then(res => { putInCache(req, res); return res; })
        .catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
    return;
  }

  if (!sameOrigin && !isCdn) return;                // leave third-party traffic alone

  /* static assets: cache-first, then refresh the entry in the background */
  e.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req)
        .then(res => { putInCache(req, res); return res; })
        .catch(() => hit || Response.error());
      return hit || network;
    })
  );
});
