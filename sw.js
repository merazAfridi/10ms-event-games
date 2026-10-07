/**
 * Service worker: makes the games work offline after the first visit.
 *
 * - Everything below is downloaded and stored on the phone during the first visit.
 * - Page + content/*.json: try the network first (so edits show up), fall back to the
 *   stored copy after 3 seconds or when offline.
 * - Everything else (JS, CSS, fonts, images): served instantly from storage and
 *   refreshed in the background.
 *
 * If you add new files (e.g. a new cover image name), add them to PRECACHE.
 * Bump VERSION when you remove or rename files so old copies are cleaned up.
 */
const VERSION = 'v21';
const CACHE = `book-of-games-${VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/lib/util.js',
  'js/lib/ui.js',
  'js/lib/shape-score.js',
  'js/lib/reward-code.js',
  'js/lib/confetti.js',
  'js/lib/reward.js',
  'js/lib/sound.js',
  'js/lib/attempts.js',
  'js/games/bangla.js',
  'js/games/english.js',
  'js/games/math.js',
  'js/games/science.js',
  'content/config.json',
  'content/bangla.json',
  'content/english.json',
  'content/math.json',
  'content/science.json',
  'assets/covers/bangla.jpg',
  'assets/covers/english.jpg',
  'assets/covers/math.jpg',
  'assets/covers/science.jpg',
  'assets/brand/10ms-logo-light.svg',
  'assets/sounds/page-flip.mp3',
  'assets/fonts/hind-siliguri-bengali-400-normal.woff2',
  'assets/fonts/hind-siliguri-bengali-600-normal.woff2',
  'assets/fonts/hind-siliguri-bengali-700-normal.woff2',
  'assets/fonts/hind-siliguri-latin-400-normal.woff2',
  'assets/fonts/hind-siliguri-latin-600-normal.woff2',
  'assets/fonts/hind-siliguri-latin-700-normal.woff2',
  'assets/fonts/fredoka-latin-600-normal.woff2',
  'assets/fonts/fredoka-latin-700-normal.woff2',
  'assets/icons/favicon-32.png',
  'assets/icons/favicon-48.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' bypasses the browser's HTTP cache so we store fresh copies.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('book-of-games-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const fresh = request.mode === 'navigate' || url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest');
  event.respondWith(fresh ? networkFirst(request) : staleWhileRevalidate(request, event));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = request.mode === 'navigate' ? './' : request;
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    /* offline – fall through to the cache */
  }
  const cached = await cache.match(key, { ignoreSearch: true });
  return cached || network;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}
