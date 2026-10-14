/** Shared "you won" screen: a full-screen "Congratulations" celebration with the player's score. */
import { h, icon, reducedMotion } from './util.js';
import { button } from './ui.js';
import { startConfetti } from './confetti.js';

const CONGRATS = 'assets/brand/congrats.jpg';
const GOLD = ['#f6c453', '#ffe08a', '#fff3cf', '#e03131', '#ff8787', '#d08a12'];

const LABELS = {
  scoreLabel: 'Your score',
  playAgain: 'Play Again',
  home: 'Back to Books',
  back: 'Back to books',
};

/**
 * score: { value, label, detail } shown under "Congratulations" (e.g. { value: '6/7', label: 'correct' }).
 * track(fn): registers a cleanup function (confetti) with the calling game.
 * Gold confetti bursts when the screen opens and again on every tap.
 */
export function showWinScreen(root, { score = null, labels = {}, onPlayAgain, onHome, track }) {
  const L = { ...LABELS, ...labels };
  const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  let stop = () => {};
  const burst = (e) => {
    if (reducedMotion() || e?.target.closest('button')) return;
    stop();
    stop = startConfetti(canvas, { colors: GOLD, burst: 220 });
  };

  // The picture fills the whole screen (big screens) or sits on a blurred copy of itself (phones);
  // the score and the buttons are placed on the picture's red carpet.
  root.replaceChildren(
    h('main', { class: 'celebrate', onclick: burst },
      h('img', { class: 'celebrate-bg', src: CONGRATS, alt: '', 'aria-hidden': 'true', draggable: 'false' }),
      h('div', { class: 'celebrate-body' },
        h('div', { class: 'celebrate-frame' },
          h('img', { class: 'celebrate-img', src: CONGRATS, alt: 'Congratulations!', draggable: 'false' }),
          score && h('div', { class: 'celebrate-score' },
            h('span', { class: 'cs-label' }, L.scoreLabel),
            h('strong', { class: 'cs-value' }, score.value),
            score.label && h('span', { class: 'cs-sub' }, score.label),
            score.detail && h('span', { class: 'cs-detail' }, score.detail),
          ),
          h('div', { class: 'celebrate-actions' },
            button(L.playAgain, onPlayAgain, { cls: 'big btn-celebrate', iconName: 'replay' }),
            button(L.home, onHome, { kind: 'secondary', cls: 'big', iconName: 'books' }),
          ),
        ),
      ),
      canvas,
      h('button', { class: 'icon-btn celebrate-back', type: 'button', 'aria-label': L.back, onclick: onHome }, icon('back')),
    ),
  );
  track(() => stop());
  requestAnimationFrame(() => burst()); // after layout, so the confetti canvas has its size
}
