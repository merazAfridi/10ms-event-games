/**
 * Book of Games – app shell (smartboard).
 * Book shelf, book open/close animation, hash router (#/bangla, #/english, #/math, #/verify),
 * screen-filling stage, content loading and service-worker registration.
 */
import { h, loadJSON, reducedMotion, done } from './lib/util.js';
import { topBar, button } from './lib/ui.js';
import { verifyRewardCode } from './lib/reward-code.js';
import { initSound, playFlip, isMuted, setMuted } from './lib/sound.js';
import { setSoundOptions, startMusic, stopMusic } from './lib/arcade.js';
import * as bangla from './games/bangla.js';
import * as english from './games/english.js';
import * as math from './games/math.js';
import * as science from './games/science.js';

const BOOKS = [
  { id: 'bangla', title: 'বাংলা', lang: 'bn', level: 'Easy', module: bangla, src: 'content/bangla.json', cover: 'assets/covers/bangla.jpg' },
  { id: 'english', title: 'English', lang: 'en', level: 'Hard', module: english, src: 'content/english.json', cover: 'assets/covers/english.jpg' },
  { id: 'math', title: 'Math', lang: 'en', level: 'Hard', module: math, src: 'content/math.json', cover: 'assets/covers/math.jpg' },
  { id: 'science', title: 'Science', lang: 'bn', level: 'Easy', module: science, src: 'content/science.json', cover: 'assets/covers/science.jpg' },
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

const gameName = (book) => content[book.id]?.title || book.title;

// ---------------------------------------------------------------- stage

// The whole app is laid out at 1600×900 and scaled up to fill the screen, so a 4K smartboard
// shows the same layout as a 1080p one, only sharper. The stage takes the screen's shape,
// so a board that isn't exactly 16:9 is filled edge to edge without cutting anything off.
const STAGE_W = 1600;
const STAGE_H = 900;

function fitStage() {
  const root = document.documentElement;
  const k = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  root.style.setProperty('--stage-k', String(k));
  root.style.setProperty('--stage-w', `${window.innerWidth / k}px`);
  root.style.setProperty('--stage-h', `${window.innerHeight / k}px`);
}
fitStage();
window.addEventListener('resize', fitStage);

// ---------------------------------------------------------------- boot

async function boot() {
  const [cfg, ...books] = await Promise.allSettled([
    loadJSON('content/config.json'),
    ...BOOKS.map((b) => loadJSON(b.src)),
  ]);
  if (cfg.status === 'fulfilled') config = cfg.value;
  setSoundOptions(config.sound);
  startMusic(); // see the note at initSound() below
  BOOKS.forEach((b, i) => { if (books[i].status === 'fulfilled') content[b.id] = books[i].value; });

  // A fresh visit always starts on the shelf, even if the address still points at a game
  // (e.g. Safari was closed in the middle of one). The staff page is the exception.
  if (/^#\/(?!verify\b)[\w-]+/.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#/`);

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
  document.title = config.pageTitle || `${config.eventName || 'EVENT NAME'} · ${config.eventTagline || 'Book of Games'}`;
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
        book.level && h('span', { class: `book-level ${book.level.toLowerCase()}`, lang: 'en' }, book.level),
      ),
    ),
  );

  homeEl.replaceChildren(
    h('header', { class: 'home-head' },
      h('img', { class: 'brand-logo', src: 'assets/brand/10ms-logo-light.svg', alt: '10 Minute School', width: '985', height: '279', draggable: 'false' }),
      h('h1', { class: 'event-name', lang: /[ঀ-৿]/.test(config.eventName || '') ? 'bn' : 'en' }, config.eventName || 'EVENT NAME'),
    ),
    h('div', { class: 'shelf', role: 'list' }, slots),
    h('div', { class: 'home-foot' }, h('p', { class: 'home-hint' }, 'Tap a book to open')),
    muteButton(),
  );
}

const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>';
const SOUND_ON = `${SPEAKER}<path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const SOUND_OFF = `${SPEAKER}<path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** Small corner button on the shelf: sound is on all the time unless someone mutes it here. */
function muteButton() {
  const btn = h('button', { class: 'mute-btn', type: 'button' });
  const show = () => {
    btn.innerHTML = isMuted() ? SOUND_OFF : SOUND_ON;
    btn.setAttribute('aria-label', isMuted() ? 'Sound off: tap to turn on' : 'Sound on: tap to mute');
    btn.classList.toggle('off', isMuted());
  };
  btn.addEventListener('click', () => {
    setMuted(!isMuted());
    if (isMuted()) stopMusic();
    else startMusic();
    show();
  });
  show();
  return btn;
}

function onBookTap(i) {
  if (current) return;
  if (!reducedMotion()) playFlip(); // start inside the tap: browsers trust sound started by a touch
  animateNext = BOOKS[i].id;
  cameFromHome = true;
  location.hash = `#/${BOOKS[i].id}`;
}

function goHome() {
  if (BOOKS.some((b) => b.id === current?.id) && !reducedMotion() && !quickClose) playFlip(); // closing a book
  if (cameFromHome) {
    cameFromHome = false;
    history.back();
  } else {
    location.replace('#/');
  }
}

// Leaving the browser (switching apps, turning the screen off, closing the tab) ends the game:
// coming back shows the shelf again. A win screen is kept so the gift code can still be shown.
let quickClose = false;
let hiddenAt = 0;

function backToShelf() {
  if (!current || current.id === 'verify' || gameEl.querySelector('.result.win')) return;
  quickClose = true; // no close animation or sound for this
  goHome();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 2000) backToShelf();
  hiddenAt = 0;
});
// Safari can restore the page from memory instead of reloading it.
window.addEventListener('pageshow', (e) => { if (e.persisted) backToShelf(); });

// ---------------------------------------------------------------- routing

async function route() {
  const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1] || '';
  const book = BOOKS.find((b) => b.id === id);
  const wanted = book ? book.id : id === 'verify' ? 'verify' : null;

  if (!wanted) cameFromHome = false;
  if (current?.id === wanted) return;
  if (current) await closeScreen(!wanted && current.id !== 'verify' && !quickClose);
  quickClose = false;
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
  const k = appBox.width / app.offsetWidth || 1; // the big-screen stage is scaled; positions inside it are not
  const r = slot.querySelector('.book-body').getBoundingClientRect();
  const W = app.offsetWidth;
  const H = app.offsetHeight;
  const bw = Math.min(W - 40, (H - 140) * 0.75);
  return {
    slot,
    card: { left: (r.left - appBox.left) / k, top: (r.top - appBox.top) / k, width: r.width / k, height: r.height / k },
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
// Music plays all the time. Try straight away: it plays at once where the browser allows sound
// without a tap (set Media autoplay to Allow on the smartboard). Otherwise the first tap anywhere
// lets the browser start it, and it carries on from there.
['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, () => startMusic(), true));
boot();
