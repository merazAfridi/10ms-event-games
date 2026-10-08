/**
 * Arcade sounds, made on the fly with Web Audio (no sound files to download):
 * a looping chiptune for the background while a game is open, and short effects for
 * right / wrong answers, a won game and a game that ends without the gift.
 *
 * Browsers only allow sound after a touch; sound.js unlocks the shared audio engine on every tap.
 */
import { audio, isMuted } from './sound.js';

const opts = { music: true, effects: true, musicVolume: 1, effectsVolume: 1 };
export function setSoundOptions(o = {}) { Object.assign(opts, o); }

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Everything goes through one loud output: a limiter (so loud never crackles) and a big
 * make-up gain, because the board is heard across a hall.
 */
let bus = null;
function output(c) {
  if (bus?.context === c) return bus;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  const boost = c.createGain();
  boost.gain.value = 1.6;
  // soft clipper: rounds off any peak the limiter lets through, so the output never crackles
  const clip = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = 0.98 * Math.tanh(1.4 * ((i / (curve.length - 1)) * 2 - 1));
  clip.curve = curve;
  limiter.connect(boost).connect(clip).connect(c.destination);
  bus = limiter;
  return bus;
}

/** One note: oscillator with a quick attack and an exponential fade. */
function note(c, out, { midi, hz, type = 'square', at, len, vol, slideTo }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz ?? freq(midi), at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.02);
}

// ---------------------------------------------------------------- effects

const EFFECTS = {
  // bright two-note "ding-ding"
  correct: (c, out, t) => {
    note(c, out, { midi: 88, at: t, len: 0.09, vol: 0.32 });
    note(c, out, { midi: 95, at: t + 0.08, len: 0.22, vol: 0.32 });
  },
  // a shape finished in Math, a good English check
  success: (c, out, t) => [84, 88, 91].forEach((m, i) => note(c, out, { midi: m, at: t + i * 0.07, len: 0.16, vol: 0.28 })),
  // low falling buzz
  wrong: (c, out, t) => {
    note(c, out, { type: 'sawtooth', hz: 220, slideTo: 90, at: t, len: 0.38, vol: 0.28 });
    note(c, out, { type: 'square', hz: 110, slideTo: 60, at: t, len: 0.38, vol: 0.16 });
  },
  // gift won: rising fanfare
  win: (c, out, t) => {
    [72, 76, 79, 84, 88, 91].forEach((m, i) => note(c, out, { midi: m, at: t + i * 0.09, len: 0.14, vol: 0.26 }));
    note(c, out, { midi: 96, at: t + 0.56, len: 0.6, vol: 0.28 });
    note(c, out, { midi: 84, type: 'triangle', at: t + 0.56, len: 0.6, vol: 0.3 });
  },
  // game over without the gift: three falling notes
  lose: (c, out, t) => [67, 63, 58].forEach((m, i) => note(c, out, { midi: m, type: 'triangle', at: t + i * 0.2, len: i === 2 ? 0.55 : 0.2, vol: 0.32 })),
};

export function sfx(kind) {
  if (isMuted() || !opts.effects || !EFFECTS[kind]) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  const out = c.createGain();
  out.gain.value = 2.2 * opts.effectsVolume;
  out.connect(output(c));
  EFFECTS[kind](c, out, c.currentTime + 0.01);
}

// ---------------------------------------------------------------- background music

const BPM = 138;
const STEP = 60 / BPM / 2; // one eighth note
// Four bars of eighths (C, Am, F, G): arpeggio lead, pumping bass.
const LEAD = [
  76, 79, 84, 79, 76, 79, 84, 88,
  72, 76, 81, 76, 72, 76, 81, 84,
  77, 81, 84, 81, 77, 81, 84, 89,
  79, 83, 86, 83, 79, 83, 86, 91,
];
const BASS = [48, 45, 41, 43];

let master = null;
let timer = 0;
let step = 0;
let nextAt = 0;

function schedule() {
  const c = audio();
  if (!c || !master) return;
  while (nextAt < c.currentTime + 0.15) {
    const i = step % LEAD.length;
    const root = BASS[Math.floor(i / 8)];
    note(c, master, { midi: LEAD[i], at: nextAt, len: STEP * 0.8, vol: 0.09 });
    note(c, master, { midi: root + (i % 2 ? 12 : 0), type: 'triangle', at: nextAt, len: STEP * 0.9, vol: 0.32 });
    if (i % 2 === 1) { // soft off-beat hi-hat
      const n = c.createBufferSource();
      n.buffer = noise(c);
      const g = c.createGain();
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      g.gain.setValueAtTime(0.05, nextAt);
      g.gain.exponentialRampToValueAtTime(0.0001, nextAt + 0.04);
      n.connect(hp).connect(g).connect(master);
      n.start(nextAt);
      n.stop(nextAt + 0.05);
    }
    nextAt += STEP;
    step += 1;
  }
}

let noiseBuf = null;
function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export function startMusic() {
  if (isMuted() || !opts.music || timer) return;
  const c = audio();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.exponentialRampToValueAtTime(0.6 * opts.musicVolume, c.currentTime + 1);
  master.connect(output(c));
  step = 0;
  nextAt = c.currentTime + 0.1;
  timer = setInterval(schedule, 40);
  schedule();
}

export function stopMusic() {
  if (!timer) return;
  clearInterval(timer);
  timer = 0;
  const c = audio();
  const m = master;
  master = null;
  if (!c || !m) return;
  m.gain.cancelScheduledValues(c.currentTime);
  m.gain.setValueAtTime(m.gain.value, c.currentTime);
  m.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
  setTimeout(() => m.disconnect(), 600);
}
