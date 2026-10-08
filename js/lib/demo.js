/**
 * Looping "how to play" demo for the start screens: a small mock game screen and a
 * pointing hand that taps and draws, played on repeat like a short video.
 *
 * demoPlayer({ label, lang, script }) returns the element. `script(screen, api)` builds one
 * round inside `screen` and plays it; it runs again (on a fresh screen) until the element
 * leaves the page.
 *
 * api.wait(ms)           pause
 * api.move(el | {x, y})  slide the hand to an element's centre (or a point in the frame)
 * api.tap(el)            move there and tap (ripple + press)
 * api.hide()             hide the hand
 * api.point(el)          {x, y} of an element's centre inside the frame
 */
import { h } from './util.js';

const STOP = Symbol('demo stopped');

export function demoPlayer({ label, lang, script }) {
  const screen = h('div', { class: 'demo-screen' });
  const ripple = h('span', { class: 'demo-ripple', 'aria-hidden': 'true' });
  const hand = h('span', { class: 'demo-hand', 'aria-hidden': 'true' }, '👆');
  const frame = h('div', { class: 'demo-frame' }, screen, ripple, hand);
  const el = h('figure', { class: 'demo', lang, 'aria-label': label },
    frame,
    h('figcaption', { class: 'demo-tag' }, h('span', { class: 'demo-dot' }), label),
  );

  const wait = (ms) => new Promise((resolve, reject) => setTimeout(() => (el.isConnected ? resolve() : reject(STOP)), ms));
  // The board stage is scaled, so convert screen pixels back to the frame's own pixels.
  const point = (target) => {
    const f = frame.getBoundingClientRect();
    const k = f.width / frame.offsetWidth || 1;
    const r = target.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - f.left) / k, y: (r.top + r.height / 2 - f.top) / k };
  };
  const place = ({ x, y }) => {
    hand.style.transform = `translate(${x}px, ${y}px)`;
    ripple.style.translate = `${x}px ${y}px`; // not transform: the ripple animates `scale`, which would scale a transform too
  };

  const api = {
    wait,
    point,
    async move(target, ms = 650) {
      hand.style.transitionDuration = `${ms}ms`;
      hand.classList.add('on');
      place(target instanceof Element ? point(target) : target);
      await wait(ms);
    },
    async tap(target) {
      await api.move(target);
      ripple.classList.remove('go');
      void ripple.offsetWidth; // restart the ripple animation
      ripple.classList.add('go');
      target.classList.add('dm-press');
      await wait(200);
      target.classList.remove('dm-press');
    },
    hide() { hand.classList.remove('on'); },
  };

  (async () => {
    // Wait until the start screen is on the page and visible (it is hidden while the book opens).
    for (let i = 0; i < 400 && !(el.isConnected && frame.offsetWidth); i++) await new Promise((r) => setTimeout(r, 50));
    hand.style.transitionDuration = '0ms';
    place({ x: frame.offsetWidth * 0.8, y: frame.offsetHeight * 0.9 });
    for (;;) {
      screen.replaceChildren();
      api.hide();
      while (!frame.offsetWidth) await wait(200); // paused while hidden
      await script(screen, api);
      await wait(1400);
    }
  })().catch((err) => { if (err !== STOP) console.error(err); });

  return el;
}

/** A clock that counts down once a second while it is on the page. */
export function demoClock(fmt, from) {
  const text = h('span', {}, fmt(from));
  let left = from;
  const id = setInterval(() => {
    if (!text.isConnected) { if (left !== from) clearInterval(id); return; }
    left = Math.max(0, left - 1);
    text.textContent = fmt(left);
  }, 1000);
  return h('span', { class: 'dm-chip dm-time' }, '⏱ ', text);
}
