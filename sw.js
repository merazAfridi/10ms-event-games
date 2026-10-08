/**
 * Service worker: makes the games work offline after the first visit.
 *
 * - Everything below is downloaded and stored on the device during the first visit.
 * - Page, code (JS, CSS) and content/*.json: try the network first, fall back to the
 *   stored copy after 3 seconds or when offline. Code and content always come from the
 *   same place, so new questions never meet old code that can't show them.
 * - Everything else (fonts, images, sounds): served instantly from storage and
 *   refreshed in the background.
 *
 * If you add new files (e.g. a new cover image name), add them to PRECACHE.
 * Bump VERSION when you remove or rename files so old copies are cleaned up.
 */
const VERSION = 'v74';
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
  'js/lib/demo.js',
  'js/lib/arcade.js',
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
  'assets/science/q1.jpg',
  'assets/science/q2.jpg',
  'assets/science/q3.jpg',
  'assets/science/q4.jpg',
  'assets/science/q5.jpg',
  'assets/science/q6.jpg',
  'assets/science/q7b.jpg',
  'assets/science/q8.jpg',
  'assets/science/q9.jpg',
  'assets/science/q10.jpg',
  'assets/science/q11.jpg',
  'assets/bangla/comic-2.jpg',
  'assets/bangla/rabi-1.jpg',
  'assets/bangla/rabi-2.jpg',
  'assets/bangla/rabi-3.jpg',
  'assets/bangla/rabi-4.jpg',
  'assets/bangla/poet-1.jpg',
  'assets/bangla/poet-2.jpg',
  'assets/bangla/poet-3.jpg',
  'assets/bangla/poet-4.jpg',
  'assets/bangla/react-yes.jpg',
  'assets/bangla/react-no.jpg',
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
  'assets/fonts/baloo-da-2-bengali-700-normal.woff2',
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

  const fresh = request.mode === 'navigate' || /\.(json|webmanifest|js|css)$/.test(url.pathname);
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
