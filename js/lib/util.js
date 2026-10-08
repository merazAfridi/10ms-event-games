/** Small DOM + formatting helpers shared by every screen. */
import { sfx } from './arcade.js';

/**
 * Create an element. Props: class, style (string), dataset, on<event> handlers,
 * boolean/property values (hidden, disabled …) and plain attributes.
 * Children may be nodes, strings, numbers, arrays, or null/false (skipped).
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (typeof value !== 'string' && key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

/** Parse a trusted, static SVG/HTML snippet into a node. */
export function html(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** 12 -> "১২" */
export const toBn = (value) => String(value).replace(/\d/g, (d) => BN_DIGITS[d]);

/** 75 -> "1:15" */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PATTERNS = {
  tap: 8,
  correct: 25,
  wrong: [45, 60, 45],
  success: [20, 50, 30],
  win: [30, 60, 30, 60, 120],
  lose: [60, 80, 60],
};
/** Feedback for a moment in the game: its arcade sound, plus a light vibration where supported (Android). */
export function haptic(kind) {
  sfx(kind);
  try {
    if (navigator.vibrate) navigator.vibrate(PATTERNS[kind] ?? 10);
  } catch {
    /* some browsers throw if called without a user gesture */
  }
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Wait for a Web Animation to finish (resolves immediately if it was cancelled). */
export const done = (animation) => animation.finished.catch(() => {});

export async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Inline icons (stroke = currentColor). */
export const ICONS = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 9v4.5l3 2M9.5 2.5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  // Arrow head clearly at the top right, so it can't be read as the Bangla digit ৩.
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M20.3 3.2v6.1h-6.1z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  books: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h5v14H4zM10.5 5.5h4v14h-4zM16 6.3l3.6-1 3 13.6-3.6 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" transform="translate(-1 0)"/></svg>',
  skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6l7 6-7 6zM13 6l7 6-7 6z" fill="currentColor"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 19.5h11M4.8 14.6l8.9-8.9a2 2 0 0 1 2.8 0l2.3 2.3a2 2 0 0 1 0 2.8l-7.6 7.6a2 2 0 0 1-1.4.6H8.6a2 2 0 0 1-1.4-.6l-2.4-2.4a1 1 0 0 1 0-1.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

export const icon = (name) => html(ICONS[name]);
