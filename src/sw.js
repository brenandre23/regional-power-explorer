/**
 * Service worker for the Design Studio build: answers requests for data files
 * from their gzipped copies, which the server can't compress itself. Not
 * bundled: the build fills in the two placeholders below and writes the
 * result to dist/sw.js (see gzipData in vite.config.js).
 *
 * Only GETs for files with a `.gz` copy are touched; everything else, the
 * PMTiles range requests and HEAD probes among them, goes to the network as
 * if there were no worker. If the `.gz` copy can't be had, the raw file is
 * fetched instead.
 */
const DATA_PREFIX = '__DATA_PREFIX__';
const GZIPPED = new Set([/* __GZIPPED__ */]);

const TYPES = {
  json: 'application/json',
  geojson: 'application/geo+json',
  html: 'text/html; charset=utf-8',
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  if (typeof DecompressionStream === 'undefined') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(DATA_PREFIX)) return;
  const file = decodeURIComponent(url.pathname.slice(DATA_PREFIX.length));
  if (!GZIPPED.has(file)) return;
  event.respondWith(fromGzip(url.origin + url.pathname + '.gz', file, request));
});

async function fromGzip(gzUrl, file, request) {
  try {
    const res = await fetch(gzUrl, { credentials: 'same-origin' });
    // The gateway answers a missing file with a redirect to an error page.
    if (!res.ok || res.redirected) return fetch(request);
    const headers = { 'Content-Type': TYPES[file.split('.').pop()] };
    // A server that labels .gz files as gzip-encoded has had them unzipped
    // by the browser already.
    if (res.headers.get('Content-Encoding')) return new Response(res.body, { headers });
    return new Response(res.body.pipeThrough(new DecompressionStream('gzip')), { headers });
  } catch {
    return fetch(request);
  }
}
