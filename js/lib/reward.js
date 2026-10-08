/** Shared "you won" screen: trophy, gift code, live clock, confetti, leave-confirmation. */
import { h, html, reducedMotion } from './util.js';
import { topBar, button, confirmSheet } from './ui.js';
import { makeRewardCode } from './reward-code.js';
import { startConfetti } from './confetti.js';

const TROPHY = `<svg class="trophy" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="#fff3cf"/>
  <path d="M38 30h44v16a22 22 0 0 1-44 0z" fill="#f6b72f"/>
  <path d="M38 36H28a12 12 0 0 0 12 16M82 36h10a12 12 0 0 1-12 16" fill="none" stroke="#f6b72f" stroke-width="6" stroke-linecap="round"/>
  <path d="M54 66h12v14H54z" fill="#e39a12"/><rect x="42" y="80" width="36" height="10" rx="4" fill="#c97f0a"/>
  <path d="M60 36l3.5 7.2 7.9 1.1-5.7 5.6 1.3 7.9-7-3.7-7 3.7 1.3-7.9-5.7-5.6 7.9-1.1z" fill="#fff8e1"/>
</svg>`;

const LABELS = {
  title: 'Challenge Completed!',
  message: 'Show this screen to collect your surprise gift!',
  codeLabel: 'Gift code',
  wonAt: 'Won at',
  leaveTitle: 'Did a staff member see your code?',
  leaveText: 'Once you leave this screen the code disappears.',
  leaveOk: 'Yes, leave',
  leaveCancel: 'Stay here',
  playAgain: 'Play Again',
  home: 'Back to Books',
  back: 'Back to books',
  plays: 'Played on this device: {plays}×',
  wins: 'Gifts won here: {wins}',
};

/**
 * rows: [{ label, value, ok }] shown under the code.
 * device: { plays, wins } for this game on this device (see attempts.js), shown on the code card.
 * num: formats numbers for the labels (e.g. toBn for Bangla screens).
 * track(fn): registers a cleanup function (timers, confetti) with the calling game.
 */
export function showWinScreen(root, { secret, rows = [], labels = {}, device = null, num = String, onPlayAgain, onHome, track }) {
  const L = { ...LABELS, ...labels };
  const earned = new Date();
  const code = makeRewardCode(secret || '', earned);
  const timeOpts = { hour: 'numeric', minute: '2-digit' };
  const now = () => new Date().toLocaleTimeString([], { ...timeOpts, second: '2-digit' });
  const liveClock = h('span', {}, now());
  const confettiCanvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });

  const leave = (action) => async () => {
    const ok = await confirmSheet({ title: L.leaveTitle, text: L.leaveText, ok: L.leaveOk, cancel: L.leaveCancel });
    if (ok) action();
  };

  root.replaceChildren(
    confettiCanvas,
    topBar({ onBack: leave(onHome), backLabel: L.back }),
    // Two blocks, side by side.
    h('main', { class: 'scroll result win' }, h('div', { class: 'win-main' },
      h('div', { class: 'result-head' },
        html(TROPHY),
        h('h1', { class: 'result-title' }, L.title),
        h('p', { class: 'result-msg' }, L.message),
      ),
      h('section', { class: 'code-card', 'aria-label': L.codeLabel },
        h('p', { class: 'code-label' }, L.codeLabel),
        h('p', { class: 'code', lang: 'en' }, code),
        h('p', { class: 'code-meta', lang: 'en' }, `${L.wonAt} ${earned.toLocaleTimeString([], timeOpts)} · ${earned.toLocaleDateString([], { day: 'numeric', month: 'short' })}`),
        h('p', { class: 'live', lang: 'en' }, h('span', { class: 'live-dot' }), 'LIVE · ', liveClock),
        device && h('p', { class: `device-count${device.wins > 1 ? ' repeat' : ''}` },
          L.plays.replace('{plays}', num(device.plays)),
          h('span', { 'aria-hidden': 'true' }, ' · '),
          L.wins.replace('{wins}', num(device.wins)),
        ),
      ),
    ), h('div', { class: 'win-side' },
      rows.length > 0 && h('ul', { class: 'best-list' },
        rows.map((r) => h('li', { class: r.ok ? 'ok' : '' }, h('span', {}, r.label), h('strong', {}, r.value))),
      ),
      h('div', { class: 'result-actions' },
        button(L.playAgain, leave(onPlayAgain), { kind: 'primary', iconName: 'replay' }),
        button(L.home, leave(onHome), { kind: 'secondary', iconName: 'books' }),
      ),
    )),
  );

  const clock = setInterval(() => { liveClock.textContent = now(); }, 1000);
  track(() => clearInterval(clock));
  if (!reducedMotion()) track(startConfetti(confettiCanvas));
}
