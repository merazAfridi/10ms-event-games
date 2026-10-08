/** Game 1 – Bangla: "বাংলা চ্যালেঞ্জ" (spelling, words, proverbs and writers; enough correct answers after all of them wins a gift). */
import { h, toBn, shuffle, haptic, icon, formatTime, reducedMotion } from '../lib/util.js';
import { topBar, button, scoreRing, resultView } from '../lib/ui.js';
import { showWinScreen } from '../lib/reward.js';
import { countPlay, countWin } from '../lib/attempts.js';
import { demoPlayer, demoClock } from '../lib/demo.js';

const LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'];
const BACK_LABEL = 'বইয়ের তাকে ফিরে যাও';
const REACTION = { yes: 'assets/bangla/react-yes.jpg', no: 'assets/bangla/react-no.jpg' };
const PRAISE = ['চমৎকার!', 'অসাধারণ!', 'দারুণ!'];
const REACTION_PAUSE = 1800; // ms the reaction pop-up stays up (tap to skip)
const DEFAULTS = { challengesToWin: 5, timeLimitSeconds: 120, challengesPerGame: 0, shuffleChallenges: true };

/** Trailing দাঁড়ি is stripped so the correct option can't be spotted by its punctuation. */
const clean = (text) => String(text ?? '').trim().replace(/[।|.\s]+$/u, '');

export function mount(root, ctx) {
  const data = ctx.content;
  const cfg = { ...DEFAULTS, ...(ctx.config.bangla || {}) };
  const secret = ctx.config.math?.rewardCodeSecret || ctx.config.rewardCodeSecret || '';
  const all = (data.challenges || []).filter((c) => c && c.answer);
  all.forEach((c) => [c.image, ...(c.pictureOptions ? c.options : [])].forEach((src) => { if (src) new Image().src = src; }));
  Object.values(REACTION).forEach((src) => { new Image().src = src; });
  const total = cfg.challengesPerGame > 0 ? Math.min(cfg.challengesPerGame, all.length) : all.length; // questions per game; 0 = all of them
  const need = Math.max(1, Math.min(Number(cfg.challengesToWin) || 1, total));
  const limit = Math.max(0, Number(cfg.timeLimitSeconds) || 0); // 0 = no time limit
  const bnTime = (seconds) => toBn(formatTime(seconds));
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
        h('ul', { class: 'facts' },
          h('li', {}, h('strong', {}, `${toBn(total)}টি`), h('span', {}, 'চ্যালেঞ্জ')),
          limit
            ? h('li', {}, h('strong', {}, bnTime(limit)), h('span', {}, 'মিনিট'))
            : h('li', {}, h('strong', {}, `${toBn(4)}টি`), h('span', {}, 'অপশন')),
          h('li', {}, h('strong', {}, `${toBn(need)}টি`), h('span', {}, 'সঠিক = পুরস্কার')),
        ),
        demo(),
      ),
      h('footer', { class: 'bottom-bar' }, button('শুরু করো', start, { cls: 'big' })),
    );
  }

  function start() {
    teardown();
    countPlay('bangla');
    const order = (cfg.shuffleChallenges ? shuffle(all) : all.slice()).slice(0, total);
    state = { order, index: 0, score: 0, picks: [], deadline: Date.now() + limit * 1000, finished: false };
    // One clock for the whole game, top right; it stops once the last question is answered.
    state.timerText = h('span', {}, bnTime(limit));
    state.timerChip = h('div', { class: 'chip timer', role: 'timer' }, icon('clock'), state.timerText);
    if (limit) {
      const id = setInterval(tick, 250);
      track(() => clearInterval(id));
    }
    question();
  }

  function tick() {
    if (state.finished) return;
    const ms = state.deadline - Date.now();
    const left = Math.max(0, Math.ceil(ms / 1000));
    state.timerText.textContent = bnTime(left);
    state.timerChip.classList.toggle('low', left <= 20);
    if (ms <= 0) {
      state.finished = true;
      if (state.score >= need) win();
      else result('time');
    }
  }

  function question() {
    const c = state.order[state.index];
    const n = state.index + 1;
    const pictures = Boolean(c.pictureOptions);
    const answer = pictures ? c.answer : clean(c.answer);
    const options = shuffle([...new Set([answer, ...(c.options || c.distractors || []).map((o) => (pictures ? o : clean(o)))])]);
    const isLast = n === total;
    let answered = false;

    const fill = h('div', { class: 'progress-fill', style: `width:${(state.index / total) * 100}%` });
    // Which question this is; the number of correct answers is only revealed at the end.
    const countChip = h('div', { class: 'chip' }, 'প্রশ্ন ', h('strong', {}, `${toBn(n)}/${toBn(total)}`));
    const feedback = h('section', { class: 'feedback', hidden: true, 'aria-live': 'polite' });
    const footer = h('footer', { class: 'bottom-bar', hidden: true });

    // --i staggers the cards as they slide in.
    const optionButtons = options.map((text, i) =>
      h('button', { class: `option${pictures ? ' pic-option' : ''}`, type: 'button', style: `--i:${i}`, dataset: { value: text }, onclick: (e) => pick(text, e.currentTarget) },
        h('span', { class: 'opt-letter', 'aria-hidden': 'true' }, LETTERS[i] || toBn(i + 1)),
        pictures
          ? h('img', { class: 'opt-img', src: text, alt: `ছবি ${LETTERS[i] || toBn(i + 1)}`, draggable: 'false' })
          : h('span', { class: 'opt-text' }, text),
        h('span', { class: 'opt-mark', 'aria-hidden': 'true' }),
      ),
    );
    const optionGroup = h('div', { class: 'options', role: 'group', 'aria-label': 'উত্তর বেছে নাও' }, optionButtons);
    const title = h('h1', { class: 'q-title' }, c.title);

    // A question with a picture: picture on the left, answers on the right (like Science).
    // Text-only question: the question on the left, the answers stacked on the right.
    // Picture answers: the question across the top, the 4 pictures in a row below it.
    const main = pictures
      ? h('main', { class: 'scroll stage-quiz bangla-quiz pic-stage' },
        h('div', { class: 'stage-head' }, title),
        optionGroup,
        feedback,
      )
      : h('main', { class: `scroll quiz bangla-quiz ${c.image ? 'picture-quiz' : 'text-stage text-split'}` },
        h('div', { class: 'quiz-ask' }, c.image ? title : h('div', { class: 'stage-head' }, title),
          c.image && h('img', { class: 'q-image', src: c.image, alt: '', draggable: 'false' })),
        h('div', { class: 'quiz-answer' }, optionGroup, feedback),
      );

    root.replaceChildren(
      topBar({
        onBack: ctx.goHome,
        backLabel: BACK_LABEL,
        center: countChip,
        right: limit ? state.timerChip : h('div', { class: 'progress-label', 'aria-label': `প্রশ্ন ${toBn(n)}, মোট ${toBn(total)}` }, `${toBn(n)}/${toBn(total)}`),
      }),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, fill),
      main,
      footer,
    );

    function pick(text, chosen) {
      if (answered || state.finished) return;
      answered = true;
      if (isLast) state.finished = true; // freezes the clock
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
      feedback.replaceChildren(...[
        h('p', { class: 'fb-verdict' }, icon(correct ? 'check' : 'cross'), correct ? 'সঠিক উত্তর!' : 'ভুল উত্তর'),
        !pictures && !correct && h('p', { class: 'fb-label' }, 'সঠিক উত্তর'),
        !pictures && !correct && h('p', { class: 'fb-answer' }, answer),
        c.meaning && h('p', { class: 'fb-meaning' }, c.image && h('strong', {}, 'অর্থ: '), c.meaning),
      ].filter(Boolean));
      fill.style.width = `${(n / total) * 100}%`;
      reaction(correct, () => {
        feedback.hidden = false;
        footer.hidden = false;
        requestAnimationFrame(() => feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      });
    }
  }

  /** Full-screen meme moment after each answer. Calls `after` when it closes (or is tapped away). */
  function reaction(correct, after) {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      overlay.remove();
      after();
    };
    const overlay = h('div', { class: `react-fx ${correct ? 'yes' : 'no'}`, role: 'alert', onclick: close },
      h('img', { class: 'react-img', src: correct ? REACTION.yes : REACTION.no, alt: '', draggable: 'false' }),
      h('strong', { class: 'react-title' }, correct ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : 'আহা! উত্তরটি সঠিক নয়'),
      h('span', { class: 'fail-skip' }, 'চালিয়ে যেতে ট্যাপ করো'),
    );
    root.append(overlay);
    const id = setTimeout(close, reducedMotion() ? 900 : REACTION_PAUSE);
    track(() => clearTimeout(id));
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
      onPlayAgain: intro,
      onHome: ctx.goHome,
      track,
    });
  }

  /** Reached the end without enough correct answers. */
  function result(reason) {
    teardown();
    const s = state.score;
    const message = `পুরস্কারের জন্য দরকার কমপক্ষে ${toBn(need)}টি সঠিক উত্তর। আরেকবার চেষ্টা করো!`;
    haptic('lose');

    root.replaceChildren(
      topBar({ onBack: ctx.goHome, backLabel: BACK_LABEL }),
      resultView({
        kicker: data.title,
        visual: scoreRing(total ? s / total : 0, `${toBn(s)}/${toBn(total)}`, 'স্কোর'),
        title: reason === 'time' ? 'সময় শেষ!' : 'খেলা শেষ!',
        message,
        actions: [
          { label: 'আবার খেলো', kind: 'primary', iconName: 'replay', onClick: start },
          { label: 'বইয়ে ফিরে যাও', kind: 'secondary', iconName: 'books', onClick: ctx.goHome },
        ],
      }),
    );
  }

  /** Start-screen demo: one right answer, one wrong answer, then the win rule. Sample questions only. */
  function demo() {
    const opt = (letter, text) => h('div', { class: 'dm-opt' }, h('b', {}, letter), text);
    const pop = (ok, text) => h('div', { class: `dm-pop ${ok ? 'yes' : 'no'}` },
      h('img', { src: ok ? REACTION.yes : REACTION.no, alt: '' }), h('strong', {}, text));
    const round = async (screen, api, n, question, options, pick, right) => {
      const opts = options.map((t, i) => opt(LETTERS[i], t));
      screen.replaceChildren(
        h('div', { class: 'dm-bar' }, h('span'), h('span', { class: 'dm-chip' }, `প্রশ্ন ${toBn(n)}/${toBn(total)}`), demoClock(bnTime, limit - (n - 1) * 9)),
        h('div', { class: 'dm-split' }, h('p', { class: 'dm-q' }, question), h('div', { class: 'dm-opts' }, opts)),
      );
      await api.wait(700);
      await api.tap(opts[pick]);
      opts.forEach((o, i) => o.classList.add(i === right ? 'ok' : i === pick ? 'bad' : 'dim'));
      await api.wait(500);
      api.hide();
      const p = pop(pick === right, pick === right ? 'চমৎকার!' : 'আহা! উত্তরটি সঠিক নয়');
      screen.append(p);
      await api.wait(1600);
      p.remove();
      await api.wait(500);
    };
    return demoPlayer({
      label: 'ডেমো: কীভাবে খেলবে',
      lang: 'bn',
      script: async (screen, api) => {
        await round(screen, api, 1, 'কোনটি একটি ফল?', ['আম', 'ইট', 'কলম', 'জুতা'], 0, 0);
        await round(screen, api, 2, 'কোন বানানটি সঠিক?', ['বিদ্দালয়', 'বিদ্যালয়', 'বিদ্যালই', 'বিদদালয়'], 0, 1);
        screen.replaceChildren(h('div', { class: 'dm-end' },
          h('strong', {}, `${toBn(total)}টি প্রশ্ন · ${bnTime(limit)} মিনিট`),
          h('span', {}, `কমপক্ষে ${toBn(need)}টি সঠিক হলেই পুরস্কার! 🎁`),
        ));
        await api.wait(2600);
      },
    });
  }

  return { destroy: teardown };
}
