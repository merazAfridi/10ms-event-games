/**
 * Page-flip sound for the book open / close animation.
 *
 * Phones only allow sound after a touch, so the audio engine is (re)started on every touch.
 * iPhones need a sound played inside that touch to unlock, and mute Web Audio when the
 * silent switch is on unless the page asks for "playback" audio.
 */
const SRC = 'assets/sounds/page-flip.mp3';
const VOLUME = 0.7;

let ctx = null;
let buffer = null;
let bytes = null;
let decoding = null;
let lastPlay = 0;
let pending = false;

function prefetch() {
  bytes ??= fetch(SRC).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  return bytes;
}

function engine() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    // iOS 17+: play even when the silent switch is on
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* not supported */ }
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

// Runs inside a touch: start or wake the audio engine.
function unlock() {
  const c = engine();
  if (!c) return;
  if (c.state !== 'running') {
    c.resume().catch(() => {});
    try {
      // iPhone: a (silent) sound started inside the touch unlocks audio output
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      s.start(0);
    } catch { /* ignore */ }
  }
  decode();
}

export function initSound() {
  prefetch();
  ['touchend', 'pointerdown', 'click', 'keydown'].forEach((e) => document.addEventListener(e, unlock, true));
}

/** Play the flip. Safe to call twice in a row (tap + animation): the second call is ignored. */
export async function playFlip() {
  const asked = performance.now();
  if (pending || asked - lastPlay < 800) return;
  const c = engine();
  if (!c) return;
  pending = true;
  try {
    if (c.state !== 'running') await c.resume();
    if (!buffer) await decode();
    // too late now (it would no longer match the page turn) or still not allowed
    if (!buffer || c.state !== 'running' || performance.now() - asked > 450) return;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = VOLUME;
    src.buffer = buffer;
    src.connect(gain).connect(c.destination);
    src.start();
    lastPlay = performance.now();
  } catch {
    // no sound this time
  } finally {
    pending = false;
  }
}
