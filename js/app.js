/**
 * Book of Games – app shell.
 * Home carousel, book open/close animation, hash router (#/bangla, #/english, #/math, #/verify),
 * content loading and service-worker registration.
 */
import { h, loadJSON, reducedMotion, done } from './lib/util.js';
import { topBar, button } from './lib/ui.js';
import { verifyRewardCode } from './lib/reward-code.js';
import { initSound, playFlip } from './lib/sound.js';
import * as bangla from './games/bangla.js';
import * as english from './games/english.js';
import * as math from './games/math.js';
import * as science from './games/science.js';

const BOOKS = [
  { id: 'bangla', title: 'বাংলা', lang: 'bn', module: bangla, src: 'content/bangla.json', cover: 'assets/covers/bangla.jpg' },
  { id: 'english', title: 'English', lang: 'en', module: english, src: 'content/english.json', cover: 'assets/covers/english.jpg' },
  { id: 'math', title: 'Math', lang: 'en', module: math, src: 'content/math.json', cover: 'assets/covers/math.jpg' },
  { id: 'science', title: 'Science', lang: 'bn', module: science, src: 'content/science.json', cover: 'assets/covers/science.jpg' },
];

const app = document.getElementById('app');
const homeEl = document.getElementById('home');
const gameEl = document.getElementById('game');

let config = {};
const content = {};
let current = null; // { id, instance }
let cameFromHome = false; // true when the open game sits on top of the home entry in history
let animateNext = null; // book id whose next open should play the animation
let slots = [];
let dots = [];
let carousel;
let activeIndex = 0;

const gameName = (book) => content[book.id]?.title || book.title;

// ---------------------------------------------------------------- boot

async function boot() {
  const [cfg, ...books] = await Promise.allSettled([
    loadJSON('content/config.json'),
    ...BOOKS.map((b) => loadJSON(b.src)),
  ]);
  if (cfg.status === 'fulfilled') config = cfg.value;
  BOOKS.forEach((b, i) => { if (books[i].status === 'fulfilled') content[b.id] = books[i].value; });

  renderHome();
  document.body.classList.add('ready');
  window.addEventListener('hashchange', queueRoute);
  queueRoute();
}

let routing = Promise.resolve();
function queueRoute() {
  routing = routing.then(route).catch((err) => console.error(err));
}

// ---------------------------------------------------------------- home

function renderHome() {
  document.title = `${config.eventName || 'EVENT NAME'} · ${config.eventTagline || 'Book of Games'}`;
  slots = BOOKS.map((book, i) =>
    h('div', { class: 'book-slot', role: 'listitem' },
      h('button', {
        class: 'book',
        type: 'button',
        dataset: { subject: book.id },
        'aria-label': `${book.title}: ${gameName(book)}`,
        onclick: () => onBookTap(i),
      },
        h('span', { class: 'book-tilt' },
          h('span', { class: 'book-float' },
            h('span', { class: 'book-body' },
              h('img', { class: 'book-cover', src: book.cover, alt: '', draggable: 'false', decoding: 'async' }),
              h('span', { class: 'book-spine' }),
              h('span', { class: 'book-gloss' }),
            ),
          ),
          h('span', { class: 'book-shadow' }),
        ),
      ),
      h('div', { class: 'book-label', 'aria-hidden': 'true' },
        h('strong', { lang: book.lang }, book.title),
        h('span', { lang: book.lang }, gameName(book)),
      ),
    ),
  );
  carousel = h('div', { class: 'carousel', role: 'list', onscroll: onCarouselScroll }, slots);
  dots = BOOKS.map((book, i) =>
    h('button', { class: 'dot', type: 'button', 'aria-label': `Show the ${book.title} book`, onclick: () => scrollToBook(i) }, h('span')),
  );

  homeEl.replaceChildren(
    h('header', { class: 'home-head' },
      h('img', { class: 'brand-logo', src: 'assets/brand/10ms-logo-light.svg', alt: '10 Minute School', width: '985', height: '279', draggable: 'false' }),
      h('h1', { class: 'event-name', lang: /[ঀ-৿]/.test(config.eventName || '') ? 'bn' : 'en' }, config.eventName || 'EVENT NAME'),
    ),
    carousel,
    h('div', { class: 'home-foot' },
      h('div', { class: 'dots' }, dots),
      h('p', { class: 'home-hint' }, 'Swipe to choose · Tap a book to open'),
    ),
  );
  setActive(0);
  requestAnimationFrame(updateCarousel);
  window.addEventListener('resize', () => requestAnimationFrame(updateCarousel));
}

let scrollFrame = 0;
function onCarouselScroll() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateCarousel);
}

/** Scale/tilt each book by its distance from the centre and pick the active one. */
function updateCarousel() {
  scrollFrame = 0;
  const box = carousel.getBoundingClientRect();
  const centre = box.left + box.width / 2;
  let best = activeIndex;
  let bestDistance = Infinity;
  slots.forEach((slot, i) => {
    const r = slot.getBoundingClientRect();
    const d = (r.left + r.width / 2 - centre) / (r.width || 1);
    const clamped = Math.max(-1, Math.min(1, d));
    slot.style.setProperty('--d', clamped.toFixed(3));
    slot.style.setProperty('--ad', Math.abs(clamped).toFixed(3));
    if (Math.abs(d) < bestDistance) { bestDistance = Math.abs(d); best = i; }
  });
  if (best !== activeIndex) setActive(best);
}

function setActive(i) {
  activeIndex = i;
  slots.forEach((s, k) => s.classList.toggle('is-active', k === i));
  dots.forEach((d, k) => d.setAttribute('aria-current', k === i ? 'true' : 'false'));
}

function scrollOffset(i) {
  const slot = slots[i];
  return slot.offsetLeft - (carousel.clientWidth - slot.offsetWidth) / 2;
}

function scrollToBook(i, smooth = true) {
  carousel.scrollTo({ left: scrollOffset(i), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  if (!smooth) updateCarousel();
}

function onBookTap(i) {
  if (current) return;
  if (i !== activeIndex) { scrollToBook(i); return; } // a peeking book: bring it to the centre first
  if (!reducedMotion()) playFlip(); // start inside the tap: phones trust sound started by a touch
  animateNext = BOOKS[i].id;
  cameFromHome = true;
  location.hash = `#/${BOOKS[i].id}`;
}

function goHome() {
  if (BOOKS.some((b) => b.id === current?.id) && !reducedMotion()) playFlip(); // closing a book
  if (cameFromHome) {
    cameFromHome = false;
    history.back();
  } else {
    location.replace('#/');
  }
}

// ---------------------------------------------------------------- routing

async function route() {
  const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1] || '';
  const book = BOOKS.find((b) => b.id === id);
  const wanted = book ? book.id : id === 'verify' ? 'verify' : null;

  if (!wanted) cameFromHome = false;
  if (current?.id === wanted) return;
  if (current) await closeScreen(!wanted && current.id !== 'verify');
  if (book) await openBook(book, animateNext === book.id);
  else if (wanted === 'verify') {
    openScreen('verify', 'en', mountVerify);
    showGameLayer(true);
  }
  animateNext = null;
}

function openScreen(id, lang, mountFn) {
  gameEl.dataset.subject = id;
  gameEl.lang = lang;
  gameEl.replaceChildren();
  let instance = null;
  try {
    instance = mountFn(gameEl);
  } catch (err) {
    console.error(err);
    mountError(gameEl, id);
  }
  current = { id, instance };
  gameEl.scrollTop = 0;
}

function showGameLayer(visible) {
  gameEl.hidden = !visible;
  homeEl.inert = visible;
  homeEl.setAttribute('aria-hidden', String(visible));
}

async function openBook(book, animate) {
  const mountFn = content[book.id]
    ? (root) => book.module.mount(root, { content: content[book.id], config, goHome })
    : (root) => mountError(root, book.id);
  openScreen(book.id, book.lang, mountFn);
  if (animate && !reducedMotion()) await playOpen(book);
  else showGameLayer(true);
}

async function closeScreen(animate) {
  const book = BOOKS.find((b) => b.id === current.id);
  if (animate && book && !reducedMotion()) await playClose(book);
  try { current.instance?.destroy?.(); } catch (err) { console.error(err); }
  current = null;
  showGameLayer(false);
  gameEl.replaceChildren();
  if (book) {
    const i = BOOKS.indexOf(book);
    if (i !== activeIndex) scrollToBook(i, false);
  }
}

function mountError(root, id) {
  const retry = async () => {
    const book = BOOKS.find((b) => b.id === id);
    try {
      if (book) content[book.id] = await loadJSON(book.src);
      location.reload();
    } catch {
      msg.textContent = 'Still offline. Please check the Wi-Fi or mobile data and try again.';
    }
  };
  const msg = h('p', { class: 'result-msg' }, 'This game could not be loaded. Please check the internet connection and try again.');
  root.replaceChildren(
    topBar({ onBack: goHome }),
    h('main', { class: 'scroll result' },
      h('div', { class: 'result-head' }, h('h1', { class: 'result-title' }, 'Oops!'), msg),
      h('div', { class: 'result-actions' }, button('Try again', retry, { iconName: 'replay' })),
    ),
  );
  return null;
}

// ---------------------------------------------------------------- book animation

const px = (r, radius) => ({
  left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius,
});

function fxGeometry(book) {
  const slot = slots[BOOKS.indexOf(book)];
  const appBox = app.getBoundingClientRect();
  const r = slot.querySelector('.book-body').getBoundingClientRect();
  const W = appBox.width;
  const H = appBox.height;
  const bw = Math.min(W - 40, (H - 140) * 0.75);
  return {
    slot,
    card: { left: r.left - appBox.left, top: r.top - appBox.top, width: r.width, height: r.height },
    mid: { left: (W - bw) / 2, top: (H - bw / 0.75) / 2, width: bw, height: bw / 0.75 },
    full: { left: 0, top: 0, width: W, height: H },
  };
}

function buildFx(book) {
  const cover = h('div', { class: 'fx-cover' },
    h('img', { class: 'fx-front', src: book.cover, alt: '', draggable: 'false' }),
    h('div', { class: 'fx-back' }),
  );
  const pageShade = h('div', { class: 'fx-page-shade' });
  const page = h('div', { class: 'fx-page' },
    h('div', { class: 'fx-title', lang: book.lang },
      h('small', {}, book.title),
      h('strong', {}, gameName(book)),
    ),
    pageShade,
  );
  const bookEl = h('div', { class: 'fx-book', dataset: { subject: book.id } }, page, cover);
  const shade = h('div', { class: 'fx-shade' });
  const fx = h('div', { class: 'fx', 'aria-hidden': 'true' }, shade, bookEl);
  app.append(fx);
  return { fx, shade, bookEl, cover, page, pageShade };
}

const BOOK_RADIUS = '4px 12px 12px 4px';
const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';
const EASE_IN = 'cubic-bezier(.5,0,.9,.55)';

async function playOpen(book) {
  const geo = fxGeometry(book);
  const { fx, shade, bookEl, cover, pageShade } = buildFx(book);
  geo.slot.classList.add('is-lifted');
  const opts = (duration, easing = EASE_OUT) => ({ duration, easing, fill: 'forwards' });
  playFlip(); // the sound's "whoosh" peaks ~0.65 s in, as the cover swings past 90°

  // 1. The book lifts out of the shelf and grows to the middle of the screen.
  shade.animate([{ opacity: 0 }, { opacity: 1 }], opts(380));
  await done(bookEl.animate([px(geo.card, BOOK_RADIUS), px(geo.mid, BOOK_RADIUS)], opts(420)));

  // 2. The cover swings open around the spine. The visible face is swapped at 90° in JS
  //    (instead of backface-visibility), which renders reliably in every engine.
  pageShade.animate([{ opacity: 0.55 }, { opacity: 0 }], opts(640, 'ease-out'));
  await done(cover.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-90deg)' }], opts(300, EASE_IN)));
  cover.classList.add('inside');
  await done(cover.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(-180deg)' }], opts(340, EASE_OUT)));

  // 3. The first page fills the screen, then fades to reveal the game underneath.
  cover.animate([{ opacity: 1 }, { opacity: 0 }], opts(160));
  await done(bookEl.animate([px(geo.mid, '2px 8px 8px 2px'), px(geo.full, '0px')], opts(320)));
  showGameLayer(true);
  await done(fx.animate([{ opacity: 1 }, { opacity: 0 }], opts(200, 'ease')));
  fx.remove();
  geo.slot.classList.remove('is-lifted');
}

async function playClose(book) {
  const i = BOOKS.indexOf(book);
  if (i !== activeIndex) scrollToBook(i, false);
  const geo = fxGeometry(book);
  const { fx, shade, bookEl, cover } = buildFx(book);
  const opts = (duration, easing = EASE_OUT) => ({ duration, easing, fill: 'forwards' });
  geo.slot.classList.add('is-lifted');
  Object.assign(bookEl.style, px(geo.full, '0px'));
  cover.style.transform = 'rotateY(-180deg)';
  cover.style.opacity = '0';
  cover.classList.add('inside');
  playFlip();

  // 1. The game fades into the book's first page.
  await done(fx.animate([{ opacity: 0 }, { opacity: 1 }], opts(160, 'ease')));
  showGameLayer(false);

  // 2. The page shrinks back to book size and the cover closes over it.
  cover.animate([{ opacity: 0 }, { opacity: 1 }], opts(160));
  await done(bookEl.animate([px(geo.full, '0px'), px(geo.mid, BOOK_RADIUS)], opts(280)));
  await done(cover.animate([{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(-90deg)' }], opts(260, EASE_IN)));
  cover.classList.remove('inside');
  await done(cover.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }], opts(280, EASE_OUT)));

  // 3. The closed book flies back to its place on the shelf.
  const target = fxGeometry(book).card;
  shade.animate([{ opacity: 1 }, { opacity: 0 }], opts(360));
  await done(bookEl.animate([px(geo.mid, BOOK_RADIUS), px(target, BOOK_RADIUS)], opts(360)));
  fx.remove();
  geo.slot.classList.remove('is-lifted');
}

// ---------------------------------------------------------------- staff code check (#/verify)

function mountVerify(root) {
  const input = h('input', {
    class: 'code-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: '1432-7KQX3',
    maxlength: '16',
    'aria-label': 'Gift code',
  });
  const out = h('div', { class: 'verify-out', 'aria-live': 'polite' });
  const check = () => {
    const res = verifyRewardCode(config.math?.rewardCodeSecret || '', input.value);
    out.className = `verify-out ${res.valid ? 'good' : 'bad'}`;
    out.replaceChildren(res.valid
      ? h('p', {}, h('strong', {}, 'Valid code ✓ '), `${res.code} was won ${res.today ? 'today' : 'yesterday'} at ${res.time}.`)
      : h('p', {}, h('strong', {}, 'Not valid ✗ '), 'This code was not produced by this app today. Check for typos.'));
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  root.replaceChildren(
    topBar({ onBack: goHome }),
    h('main', { class: 'scroll intro verify' },
      h('div', { class: 'intro-hero' },
        h('p', { class: 'kicker' }, 'Staff only'),
        h('h1', { class: 'intro-title display' }, 'Check a gift code'),
        h('p', { class: 'intro-sub' }, 'Type the code shown on the player’s win screen (Bangla, English, Math or Science).'),
      ),
      h('section', { class: 'card' }, input, button('Check code', check, { iconName: 'check', cls: 'big' })),
      out,
      h('p', { class: 'muted small' }, 'Codes are checked against the date and the secret in content/config.json. Keep a list of codes you have already accepted so the same code can’t be used twice.'),
    ),
  );
  return null;
}

// ---------------------------------------------------------------- device behaviour

// iOS Safari ignores user-scalable=no, so block pinch-zoom gestures directly.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW', err)));
  // A new version was deployed: reload once to use it, but never in the middle of a game.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || current) return;
      reloaded = true;
      location.reload();
    });
  }
}

initSound();
boot();
