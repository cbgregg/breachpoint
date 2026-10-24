// Service worker: keeps the game's ~40 MB of models, textures, fonts and three.js on the device, so a second
// visit starts without downloading them again (static hosts only let browsers cache files for minutes).
// - assets/ and lib/: served from the cache straight away, and re-checked in the background (a conditional
//   request: an unchanged file costs a few hundred bytes), so a replaced file shows up on the next visit.
// - everything else (the page, scripts, styles, motd.json): always from the network, so an update is never
//   stale; the cached copy is only used when the network fails (offline play once loaded).
const ASSETS = 'bp-assets-v1', APP = 'bp-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== ASSETS && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;   // (video seeks ask for byte ranges)
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.search.includes('nosw')) return;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (/^(assets|lib)\//.test(path)) e.respondWith(cacheFirst(e, req));
  else e.respondWith(networkFirst(req));
});

async function cacheFirst(e, req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  const refresh = fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok && r.status === 200) cache.put(req, r.clone()); return r; });
  if (hit) { e.waitUntil(refresh.catch(() => {})); return hit; }
  return refresh;
}

async function networkFirst(req) {
  const cache = await caches.open(APP);
  try {
    const r = await fetch(req);
    if (r.ok && r.status === 200) cache.put(req, r.clone());
    return r;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
