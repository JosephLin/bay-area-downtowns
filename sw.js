/* Downtown Ledger — offline shell.
 *
 * The places this thing is most useful (Niles Canyon, the Delta levees, the
 * Half Moon Bay coast) are the places with the worst signal, so the ledger
 * itself has to work with no connection: the list, the notes, the sun dates
 * and the visit tracking are all local once the shell is cached.
 *
 * Map tiles are a separate, capped cache. Only the tiles you have actually
 * looked at get stored, so panning around at home before a trip is what
 * makes the map available in the field. Anywhere you haven't browsed will
 * be blank offline — that is expected, not a failure.
 */
const SHELL = 'ledger-shell-v1';
const TILES = 'ledger-tiles-v1';
const TILE_LIMIT = 400;

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // One bad CDN response shouldn't fail the whole install, so add them individually.
      .then(c => Promise.all(SHELL_URLS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  // Oldest-first: keys() returns insertion order, so drop from the front.
  for (const k of keys.slice(0, Math.max(0, keys.length - TILE_LIMIT))) await cache.delete(k);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) { await cache.put(req, res.clone()); trimTiles(); }
        return res;
      } catch (err) {
        // Offline and never viewed: let Leaflet render an empty tile.
        return new Response('', { status: 504, statusText: 'tile not cached' });
      }
    })());
    return;
  }

  // Everything else — the page, Leaflet, the fonts — is cache-first, then
  // refreshed from the network in the background when there is one.
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: false });
    const fresh = fetch(req).then(res => {
      if (res && res.ok && (url.origin === self.location.origin || res.type === 'cors')) {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    }).catch(() => null);
    return hit || (await fresh) || new Response('Offline and not cached.', { status: 503 });
  })());
});
