/**
 * Page-flip sound for the book open / close animation.
 *
 * Uses Web Audio (no delay, works offline once the file is cached). Phones only allow sound after
 * the player has touched the screen, so the audio engine is started on the first touch and the
 * sound simply stays silent until then.
 */
const SRC = 'assets/sounds/page-flip.mp3';
const VOLUME = 0.6;

let ctx = null;
let buffer = null;
let bytes = null;

// Download early (no audio engine needed for that), decode on the first touch.
function prefetch() {
  bytes ??= fetch(SRC).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  return bytes;
}

async function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx ??= new AC();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!buffer) {
      const data = await prefetch();
      if (data && !buffer) buffer = await ctx.decodeAudioData(data.slice(0));
    }
  } catch { /* no sound is fine */ }
}

export function initSound() {
  prefetch();
  const events = ['pointerdown', 'touchend', 'keydown'];
  const onFirst = () => { unlock(); if (ctx?.state === 'running') events.forEach((e) => document.removeEventListener(e, onFirst, true)); };
  events.forEach((e) => document.addEventListener(e, onFirst, true));
}

export function playFlip() {
  if (!ctx || !buffer || ctx.state !== 'running') return;
  try {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = VOLUME;
    src.buffer = buffer;
    src.connect(gain).connect(ctx.destination);
    src.start();
  } catch { /* ignore */ }
}
