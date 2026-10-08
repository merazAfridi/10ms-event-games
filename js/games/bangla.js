/** Game 1 – Bangla: "কথায় কথায় বাগধারা" (pick the proverb that fits; 4+ correct after all 6 wins a gift). */
import { h, toBn, shuffle, haptic, icon } from '../lib/util.js';
import { topBar, button, scoreRing, resultView } from '../lib/ui.js';
import { showWinScreen } from '../lib/reward.js';
import { countPlay, countWin } from '../lib/attempts.js';

const LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'];
const BACK_LABEL = 'বইয়ের তাকে ফিরে যাও';
const DEFAULTS = { challengesToWin: 4 };

/** Trailing দাঁড়ি is stripped so the correct option can't be spotted by its punctuation. */
const clean = (text) => String(text ?? '').trim().replace(/[।|.\s]+$/u, '');

export function mount(root, ctx) {
  const data = ctx.content;
  const cfg = { ...DEFAULTS, ...(ctx.config.bangla || {}) };
  const secret = ctx.config.math?.rewardCodeSecret || ctx.config.rewardCodeSecret || '';
  const challenges = (data.challenges || []).filter((c) => c && c.answer);
  const total = challenges.length;
  const need = Math.max(1, Math.min(Number(cfg.challengesToWin) || 1, total));
  let state;
  let cleanup = [];
  const track = (fn) => cleanup.push(fn);
  const teardown = () => { cleanup.forEach((fn) => fn()); cleanup = []; };

  intro();

  function intro() {
    teardown();
    root.replaceChildren(
      topBar({ onBack: ctx.goHome, backLabel: BACK_LABEL }),
      h('main', { class: 'scroll intro' },
        h('div', { class: 'intro-hero' },
          h('p', { class: 'kicker' }, 'বাংলা'),
          h('h1', { class: 'intro-title' }, data.title),
          data.subtitle && h('p', { class: 'intro-sub' }, data.subtitle),
        ),
        h('section', { class: 'card rule-card' },
          h('h2', { class: 'card-label' }, 'খেলার নিয়ম'),
          h('p', {}, data.rule),
          data.winRule && h('p', { style: 'margin-top:10px' }, h('strong', {}, data.winRule.replace('{target}', toBn(need)))),
        ),
        h('ul', { class: 'facts' },
          h('li', {}, h('strong', {}, `${toBn(total)}টি`), h('span', {}, 'চ্যালেঞ্জ')),
          h('li', {}, h('strong', {}, `${toBn(4)}টি`), h('span', {}, 'অপশন')),
          h('li', {}, h('strong', {}, `${toBn(need)}টি`), h('span', {}, 'সঠিক = পুরস্কার')),
        ),
      ),
      h('footer', { class: 'bottom-bar' }, button('শুরু করো', start, { cls: 'big' })),
    );
  }

  function start() {
    teardown();
    countPlay('bangla');
    state = { index: 0, score: 0, picks: [] };
    question();
  }

  // "সঠিক ২ / ৬": correct answers out of all questions
  const chipText = () => ` ${toBn(state.score)} / ${toBn(total)}`;

  function question() {
    const c = challenges[state.index];
    const n = state.index + 1;
    const answer = clean(c.answer);
    const options = shuffle([...new Set([answer, ...(c.distractors || []).map(clean)])]);
    const isLast = n === total;
    let answered = false;

    const fill = h('div', { class: 'progress-fill', style: `width:${(state.index / total) * 100}%` });
    const chipValue = h('strong', {}, chipText());
    const scoreChip = h('div', { class: 'chip' }, 'সঠিক', chipValue);
    const feedback = h('section', { class: 'feedback', hidden: true, 'aria-live': 'polite' });
    const footer = h('footer', { class: 'bottom-bar', hidden: true });

    const optionButtons = options.map((text, i) =>
      h('button', { class: 'option', type: 'button', dataset: { value: text }, onclick: (e) => pick(text, e.currentTarget) },
        h('span', { class: 'opt-letter', 'aria-hidden': 'true' }, LETTERS[i] || toBn(i + 1)),
        h('span', { class: 'opt-text' }, text),
        h('span', { class: 'opt-mark', 'aria-hidden': 'true' }),
      ),
    );

    // Two blocks, side by side.
    const main = h('main', { class: 'scroll quiz' },
      h('div', { class: 'quiz-ask' },
        h('p', { class: 'kicker' }, `চ্যালেঞ্জ ${toBn(n)}`),
        h('h1', { class: 'q-title' }, c.title),
        h('section', { class: 'card situation' },
          h('h2', { class: 'card-label' }, 'পরিস্থিতি'),
          h('p', {}, c.situation),
        ),
        h('section', { class: 'question' },
          h('h2', { class: 'card-label' }, 'প্রশ্ন'),
          h('p', { class: 'q-text' }, c.question),
        ),
      ),
      h('div', { class: 'quiz-answer' },
        h('div', { class: 'options', role: 'group', 'aria-label': 'উত্তর বেছে নাও' }, optionButtons),
        feedback,
      ),
    );

    root.replaceChildren(
      topBar({
        onBack: ctx.goHome,
        backLabel: BACK_LABEL,
        center: h('div', { class: 'progress-label', 'aria-label': `প্রশ্ন ${toBn(n)}, মোট ${toBn(total)}` }, `${toBn(n)}/${toBn(total)}`),
        right: scoreChip,
      }),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, fill),
      main,
      footer,
    );

    function pick(text, chosen) {
      if (answered) return;
      answered = true;
      const correct = text === answer;
      if (correct) state.score += 1;
      state.picks.push({ correct, picked: text });
      const label = !isLast ? 'পরবর্তী' : state.score >= need ? 'পুরস্কার দেখো' : 'ফলাফল দেখো';
      footer.replaceChildren(button(label, next, { cls: 'big', iconName: 'next' }));
      haptic(correct ? 'correct' : 'wrong');

      for (const b of optionButtons) {
        b.disabled = true;
        const mark = b.querySelector('.opt-mark');
        if (b.dataset.value === answer) {
          b.classList.add('is-correct');
          mark.append(icon('check'));
        } else if (b === chosen) {
          b.classList.add('is-wrong');
          mark.append(icon('cross'));
        } else {
          b.classList.add('is-dim');
        }
      }

      feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
      feedback.replaceChildren(
        h('p', { class: 'fb-verdict' }, icon(correct ? 'check' : 'cross'), correct ? 'সঠিক উত্তর!' : 'ভুল উত্তর'),
        h('p', { class: 'fb-label' }, 'সঠিক বাগধারা'),
        h('p', { class: 'fb-answer' }, answer),
        c.meaning && h('p', { class: 'fb-meaning' }, h('strong', {}, 'অর্থ: '), c.meaning),
      );
      feedback.hidden = false;
      footer.hidden = false;
      fill.style.width = `${(n / total) * 100}%`;
      chipValue.textContent = chipText();
      requestAnimationFrame(() => feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  }

  function next() {
    state.index += 1;
    if (state.index < total) question();
    else if (state.score >= need) win();
    else result();
  }

  function win() {
    teardown();
    haptic('win');
    showWinScreen(root, {
      secret,
      device: countWin('bangla'),
      num: toBn,
      labels: {
        plays: 'এই ডিভাইসে খেলা হয়েছে: {plays} বার',
        wins: 'পুরস্কার জিতেছে: {wins} বার',
        title: data.winTitle || 'চ্যালেঞ্জ সম্পন্ন!',
        message: data.winMessage || 'সারপ্রাইজ পুরস্কার পেতে এই স্ক্রিনটি দেখাও!',
        codeLabel: 'Gift code',
        leaveTitle: 'স্টাফ কি কোডটি দেখেছেন?',
        leaveText: 'এই স্ক্রিন থেকে বের হলে কোডটি আর দেখা যাবে না।',
        leaveOk: 'হ্যাঁ, বের হব',
        leaveCancel: 'এখানেই থাকব',
        playAgain: 'আবার খেলো',
        home: 'বইয়ে ফিরে যাও',
        back: BACK_LABEL,
      },
      rows: [
        ...state.picks.map((p, i) => ({ label: `${toBn(i + 1)}. ${challenges[i].title}`, value: p.correct ? '✓' : '✗', ok: p.correct })),
        { label: 'সঠিক উত্তর', value: `${toBn(state.score)}/${toBn(state.picks.length)}` },
      ],
      onPlayAgain: intro,
      onHome: ctx.goHome,
      track,
    });
  }

  /** Reached the end without enough correct answers. */
  function result() {
    const s = state.score;
    const message = `পুরস্কারের জন্য দরকার ${toBn(need)}টি সঠিক উত্তর। আরেকবার চেষ্টা করো!`;
    haptic('wrong');

    const review = h('ol', { class: 'review', 'aria-label': 'উত্তরের তালিকা' },
      challenges.map((c, i) => {
        const ok = state.picks[i]?.correct;
        return h('li', { class: ok ? 'ok' : 'bad' },
          h('span', { class: 'rv-mark' }, icon(ok ? 'check' : 'cross')),
          h('div', {},
            h('p', { class: 'rv-title' }, `${toBn(i + 1)}. ${c.title}`),
            h('p', { class: 'rv-answer' }, clean(c.answer)),
          ),
        );
      }),
    );

    root.replaceChildren(
      topBar({ onBack: ctx.goHome, backLabel: BACK_LABEL }),
      resultView({
        kicker: data.title,
        visual: scoreRing(total ? s / total : 0, `${toBn(s)}/${toBn(total)}`, 'স্কোর'),
        title: 'খেলা শেষ!',
        message,
        extra: review,
        actions: [
          { label: 'আবার খেলো', kind: 'primary', iconName: 'replay', onClick: start },
          { label: 'বইয়ে ফিরে যাও', kind: 'secondary', iconName: 'books', onClick: ctx.goHome },
        ],
      }),
    );
  }

  return { destroy: teardown };
}
