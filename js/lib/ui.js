/** Building blocks shared by the three games: top bar, result screen, score ring, confirm sheet. */
import { h, html, icon } from './util.js';

/** Sticky top bar with the back button top-left. */
export function topBar({ onBack, backLabel = 'Back to books', center = null, right = null }) {
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn back-btn', type: 'button', 'aria-label': backLabel, onclick: onBack }, icon('back')),
    h('div', { class: 'topbar-center' }, center),
    h('div', { class: 'topbar-right' }, right),
  );
}

export function button(label, onClick, { kind = 'primary', iconName = null, cls = '', disabled = false } = {}) {
  return h('button', { class: `btn ${kind} ${cls}`.trim(), type: 'button', onclick: onClick, disabled },
    iconName && icon(iconName),
    h('span', {}, label),
  );
}

/** Animated circular score meter. */
export function scoreRing(fraction, label, sub = null) {
  const c = 2 * Math.PI * 52;
  const ring = html(`<div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ring-track" cx="60" cy="60" r="52"/>
      <circle class="ring-fill" cx="60" cy="60" r="52" stroke-dasharray="${c}" stroke-dashoffset="${c}"/>
    </svg><div class="ring-label"></div></div>`);
  ring.querySelector('.ring-label').append(h('strong', {}, label), sub && h('span', {}, sub));
  const fill = ring.querySelector('.ring-fill');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.strokeDashoffset = String(c * (1 - Math.max(0, Math.min(1, fraction))));
  }));
  return ring;
}

/**
 * Full-page result layout used at the end of every game.
 * actions: [{ label, onClick, kind, iconName }]
 */
export function resultView({ kicker, title, message, visual, extra, actions }) {
  return h('main', { class: 'scroll result' },
    h('div', { class: 'result-head' },
      kicker && h('p', { class: 'kicker' }, kicker),
      visual,
      h('h1', { class: 'result-title' }, title),
      message && h('p', { class: 'result-msg' }, message),
    ),
    extra,
    h('div', { class: 'result-actions' },
      actions.map((a) => button(a.label, a.onClick, { kind: a.kind || 'secondary', iconName: a.iconName })),
    ),
  );
}

/** Bottom-sheet confirmation. Resolves true/false. */
export function confirmSheet({ title, text, ok = 'Leave', cancel = 'Stay' }) {
  return new Promise((resolve) => {
    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      backdrop.classList.add('closing');
      setTimeout(() => backdrop.remove(), 220);
      resolve(value);
    };
    const backdrop = h('div', {
      class: 'sheet-backdrop',
      onclick: (e) => { if (e.target === backdrop) close(false); },
    },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', { class: 'sheet-title' }, title),
        text && h('p', { class: 'sheet-text' }, text),
        h('div', { class: 'sheet-actions' },
          button(cancel, () => close(false), { kind: 'secondary' }),
          button(ok, () => close(true), { kind: 'primary' }),
        ),
      ),
    );
    document.getElementById('app').append(backdrop);
  });
}
