/**
 * Page-flip sound for the book open / close animation.
 *
 * Phones only allow sound after a touch, so audio is unlocked on every touch.
 * iPhones mute Web Audio when the silent switch is on, so there the sound is played through a
 * plain <audio> element instead (media audio plays in silent mode). Everywhere else Web Audio
 * is used because it starts with no delay.
 */
const SRC = 'assets/sounds/page-flip.mp3';
const VOLUME = 2.5; // above 1 = louder than the file itself
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let bytes = null;
let lastPlay = 0;
let pending = false;

function prefetch() {
  bytes ??= fetch(SRC).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  return bytes;
}

// ---------------------------------------------------------------- iPhone: <audio> element

let el = null;
let elReady = null;

function element() {
  // Played from a blob URL: Safari won't play media that comes through the service worker cache.
  elReady ??= prefetch().then((data) => {
    if (!data) return null;
    el = new Audio(URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' })));
    el.preload = 'auto';
    return el;
  });
  return elReady;
}

let elUnlocked = false;
function unlockElement() {
  if (elUnlocked || !el) { element(); return; }
  elUnlocked = true;
  // A muted play inside the touch unlocks later plays that aren't started by a touch
  // (e.g. the phone's own back button).
  el.muted = true;
  el.play().then(() => {
    if (el.muted) { el.pause(); el.currentTime = 0; el.muted = false; } // not if a real flip took over
  }).catch(() => { el.muted = false; elUnlocked = false; });
}

// Called without any await first, so the play() still counts as part of the tap.
function playElement() {
  if (!el) { element(); return Promise.resolve(false); }
  elUnlocked = true;
  el.muted = false;
  el.currentTime = 0;
  return el.play().then(() => true);
}

// ---------------------------------------------------------------- everyone else: Web Audio

let ctx = null;
let buffer = null;
let decoding = null;

function engine() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

function decode() {
  decoding ??= prefetch()
    .then((data) => (data ? engine()?.decodeAudioData(data.slice(0)) : null))
    .then((b) => { buffer = b || null; })
    .catch(() => { decoding = null; });
  return decoding;
}

function unlockEngine() {
  const c = engine();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  decode();
}

async function playEngine(asked) {
  const c = engine();
  if (!c) return false;
  if (c.state !== 'running') await c.resume();
  if (!buffer) await decode();
  // too late now (it would no longer match the page turn) or still not allowed
  if (!buffer || c.state !== 'running' || performance.now() - asked > 450) return false;
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = VOLUME;
  const limiter = c.createDynamicsCompressor(); // loud without crackling
  limiter.threshold.value = -3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  src.buffer = buffer;
  src.connect(gain).connect(limiter).connect(c.destination);
  src.start();
  return true;
}

// ---------------------------------------------------------------- public

/** The shared Web Audio engine (arcade.js plays its music and effects through it). */
export const audio = () => engine();

/** One switch for every sound on the site (the mute button on the shelf). */
let muted = false;
export const isMuted = () => muted;
export function setMuted(value) { muted = Boolean(value); }


export function initSound() {
  prefetch();
  if (IOS) element();
  const unlock = IOS ? unlockElement : unlockEngine;
  ['touchend', 'pointerdown', 'click', 'keydown'].forEach((e) => document.addEventListener(e, unlock, true));
}

/** Play the flip. Safe to call twice in a row (tap + animation): the second call is ignored. */
export async function playFlip() {
  const asked = performance.now();
  if (muted || pending || asked - lastPlay < 800) return;
  pending = true;
  try {
    // no await before this call: on iPhone play() has to start inside the tap
    if (await (IOS ? playElement() : playEngine(asked))) lastPlay = performance.now();
  } catch {
    // no sound this time
  } finally {
    pending = false;
  }
}
