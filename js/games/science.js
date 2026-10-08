/** Game 4 – Science Challenge: picture questions with a twist, 2-minute timer, 2 correct answers win. */
import { h, html, toBn, shuffle, haptic, icon, formatTime, reducedMotion } from '../lib/util.js';
import { topBar, button, scoreRing, resultView } from '../lib/ui.js';
import { showWinScreen } from '../lib/reward.js';
import { countPlay, countWin } from '../lib/attempts.js';
import { demoPlayer, demoClock } from '../lib/demo.js';

const LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'];
const BACK_LABEL = 'বইয়ের তাকে ফিরে যাও';
const FAIL_PAUSE = 2000; // ms the "Science Fail" animation stays up (tap to skip)

const FAIL_LINES = [
  'ল্যাবে ছোটখাটো বিস্ফোরণ!',
  'নিউটনের আপেলটা এবার মাথায় পড়ল!',
  'আইনস্টাইনের চুল আরও এলোমেলো হয়ে গেল!',
  'ফ্লাস্ক বলছে: আরেকবার ভেবে দেখো!',
  'বিজ্ঞান একটু মন খারাপ করল…',
  'ল্যাব কোট পুড়ে কালো হয়ে গেল!',
];

const DEFAULTS = { timeLimitSeconds: 120, challengesToWin: 5, challengesPerGame: 0, shuffleChallenges: true };

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const bnTime = (seconds) => toBn(formatTime(seconds));

/** Cartoon flask with a face; `burnt` = sooty, dizzy version shown after the explosion. */
const flask = (burnt) => `<svg class="flask ${burnt ? 'burnt' : 'calm'}" viewBox="0 0 120 150" aria-hidden="true">
  <path d="M46 10h28v8h-4v30l34 66a14 14 0 0 1-12.5 20h-63A14 14 0 0 1 16 114l34-66V18h-4z"
    fill="${burnt ? '#5b5560' : '#e9f6fb'}" stroke="#2a2330" stroke-width="5" stroke-linejoin="round"/>
  <path d="M30 96h60l14 22a10 10 0 0 1-9 14H25a10 10 0 0 1-9-14z" fill="${burnt ? '#3a3540' : '#4fd1c5'}"/>
  ${burnt
    ? '<path d="M44 104l10 10M54 104l-10 10M66 104l10 10M76 104l-10 10" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M50 124q10-6 20 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
    : '<circle cx="49" cy="110" r="5" fill="#2a2330"/><circle cx="71" cy="110" r="5" fill="#2a2330"/><path d="M52 121q8 6 16 0" fill="none" stroke="#2a2330" stroke-width="4" stroke-linecap="round"/>'}
</svg>`;

export function mount(root, ctx) {
  const data = ctx.content;
  const cfg = { ...DEFAULTS, ...(ctx.config.science || {}) };
  const secret = ctx.config.math?.rewardCodeSecret || ctx.config.rewardCodeSecret || '';
  const all = (data.challenges || []).filter((c) => c && c.answer);
  const perGame = cfg.challengesPerGame > 0 ? Math.min(cfg.challengesPerGame, all.length) : all.length; // 0 = all of them
  const need = Math.max(1, Math.min(cfg.challengesToWin, perGame));
  all.forEach((c) => { if (c.image) new Image().src = c.image; }); // pictures are ready before the timer starts

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
          h('p', { class: 'kicker' }, 'বিজ্ঞান'),
          h('h1', { class: 'intro-title display', lang: 'en' }, data.title || 'Science Challenge'),
          data.subtitle && h('p', { class: 'intro-sub' }, data.subtitle),
        ),
        h('ul', { class: 'facts' },
          h('li', {}, h('strong', {}, bnTime(cfg.timeLimitSeconds)), h('span', {}, 'মিনিট')),
          h('li', {}, h('strong', {}, `${toBn(perGame)}টি`), h('span', {}, 'চ্যালেঞ্জ')),
          h('li', {}, h('strong', {}, `${toBn(need)}টি`), h('span', {}, 'সঠিক = পুরস্কার')),
        ),
        demo(),
      ),
      h('footer', { class: 'bottom-bar' }, button('শুরু করো', play, { cls: 'big' })),
    );
  }

  function play() {
    teardown();
    const order = (cfg.shuffleChallenges ? shuffle(all) : all.slice()).slice(0, perGame);
    countPlay('science');
    const st = { i: 0, correct: 0, results: [], deadline: Date.now() + cfg.timeLimitSeconds * 1000, over: false, finished: false };

    const timerText = h('span', {}, bnTime(cfg.timeLimitSeconds));
    const timerChip = h('div', { class: 'chip timer', role: 'timer' }, icon('clock'), timerText);
    const questionNo = h('strong', {}, `${toBn(1)}/${toBn(order.length)}`); // correct answers are only revealed at the end
    const bar = h('div', { class: 'progress-fill', style: 'width:0%' });
    const main = h('main', { class: `scroll quiz${all.some((c) => c.image) ? ' picture-quiz' : ''}` });
    const footer = h('footer', { class: 'bottom-bar', hidden: true });

    root.replaceChildren(
      topBar({
        onBack: ctx.goHome,
        backLabel: BACK_LABEL,
        center: h('div', { class: 'chip' }, 'প্রশ্ন ', questionNo),
        right: timerChip,
      }),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, bar),
      main,
      footer,
    );

    const timer = setInterval(tick, 250);
    track(() => clearInterval(timer));
    show();

    function tick() {
      if (st.over || st.finished) return;
      const ms = st.deadline - Date.now();
      const left = Math.max(0, Math.ceil(ms / 1000));
      timerText.textContent = bnTime(left);
      timerChip.classList.toggle('low', left <= 20);
      if (ms <= 0) { if (st.correct >= need) win(); else end('time'); }
    }

    function show() {
      const c = order[st.i];
      const answer = clean(c.answer);
      const options = shuffle([...new Set([answer, ...(c.options || []).map(clean)])]);
      let answered = false;
      questionNo.textContent = `${toBn(st.i + 1)}/${toBn(order.length)}`;
      bar.style.width = `${(st.i / order.length) * 100}%`;

      const feedback = h('section', { class: 'feedback', hidden: true, 'aria-live': 'polite' });
      const buttons = options.map((text, i) =>
        h('button', { class: 'option', type: 'button', dataset: { value: text }, onclick: (e) => pick(text, e.currentTarget) },
          h('span', { class: 'opt-letter', 'aria-hidden': 'true' }, LETTERS[i] || toBn(i + 1)),
          h('span', { class: 'opt-text' }, text),
          h('span', { class: 'opt-mark', 'aria-hidden': 'true' }),
        ),
      );

      // Two blocks, side by side.
      main.replaceChildren(
        h('div', { class: 'quiz-ask' },
          h('h1', { class: 'q-title' }, c.title),
          c.image && h('img', { class: 'q-image', src: c.image, alt: '', draggable: 'false' }),
          c.caption && h('p', { class: 'q-caption' }, c.caption),
          c.situation && h('section', { class: 'card situation' },
            h('h2', { class: 'card-label' }, 'পরিস্থিতি'),
            h('p', { class: 'pre' }, c.situation),
          ),
          c.question && h('section', { class: 'question' },
            h('h2', { class: 'card-label' }, 'প্রশ্ন'),
            h('p', { class: 'q-text' }, c.question),
          ),
        ),
        h('div', { class: 'quiz-answer' },
          h('div', { class: 'options', role: 'group', 'aria-label': 'উত্তর বেছে নাও' }, buttons),
          feedback,
        ),
      );
      main.scrollTop = 0;
      footer.hidden = true;

      function pick(text, chosen) {
        if (answered || st.over) return;
        answered = true;
        const ok = text === answer;
        st.results.push({ title: c.title, ok });
        if (st.i + 1 >= order.length) st.finished = true; // last answer freezes the timer
        bar.style.width = `${((st.i + 1) / order.length) * 100}%`;
        for (const b of buttons) {
          b.disabled = true;
          if (b === chosen) {
            b.classList.add(ok ? 'is-correct' : 'is-wrong');
            b.querySelector('.opt-mark').append(icon(ok ? 'check' : 'cross'));
          } else if (b.dataset.value === answer) { // after a wrong pick, show the right answer too
            b.classList.add('is-correct');
            b.querySelector('.opt-mark').append(icon('check'));
          } else {
            b.classList.add('is-dim');
          }
        }

        if (ok) {
          st.correct += 1;
          haptic('correct');
          feedback.className = 'feedback good';
          feedback.replaceChildren(
            h('p', { class: 'fb-verdict' }, icon('check'), 'সঠিক! দারুণ বৈজ্ঞানিক চিন্তা!'),
            h('p', { class: 'fb-label' }, 'কেন?'),
            h('p', { class: 'fb-meaning pre' }, c.why),
          );
          feedback.hidden = false;
          showNext();
          requestAnimationFrame(() => feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
        } else {
          haptic('wrong');
          feedback.className = 'feedback bad';
          feedback.replaceChildren(
            h('p', { class: 'fb-verdict' }, icon('cross'), 'Science Fail!'),
            h('p', { class: 'fb-answer-line' }, 'সঠিক উত্তর: ', h('strong', {}, answer)),
            c.why && h('p', { class: 'fb-meaning pre' }, h('strong', {}, 'কেন? '), c.why),
          );
          scienceFail(() => {
            if (st.over) return;
            feedback.hidden = false;
            showNext();
            requestAnimationFrame(() => feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
          });
        }
      }
    }

    function showNext() {
      const last = st.i + 1 >= order.length;
      const label = !last ? 'পরবর্তী' : st.correct >= need ? 'পুরস্কার দেখো' : 'ফলাফল দেখো';
      footer.replaceChildren(button(label, next, { cls: 'big', iconName: 'next' }));
      footer.hidden = false;
    }

    function next() {
      if (st.over) return;
      st.i += 1;
      if (st.i < order.length) show();
      else if (st.correct >= need) win();
      else end('done');
    }

    /** Humorous full-screen "Science Fail" moment. Calls `after` when it closes (or is tapped away). */
    function scienceFail(after) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
        after();
      };
      const overlay = h('div', { class: 'fail-fx', role: 'alert', onclick: close },
        h('div', { class: 'fail-stage' },
          html(flask(false)),
          html(flask(true)),
          [1, 2, 3, 4, 5, 6].map((n) => h('span', { class: `puff p${n}` })),
          h('span', { class: 'boom' }),
        ),
        h('strong', { class: 'fail-title', lang: 'en' }, 'Science Fail!'),
        h('span', { class: 'fail-line' }, FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)]),
        h('span', { class: 'fail-skip' }, 'চালিয়ে যেতে ট্যাপ করো'),
      );
      root.append(overlay);
      const id = setTimeout(close, reducedMotion() ? 900 : FAIL_PAUSE);
      track(() => clearTimeout(id));
    }

    function win() {
      st.over = true;
      teardown();
      haptic('win');
      showWinScreen(root, {
        secret,
        device: countWin('science'),
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
        onPlayAgain: play,
        onHome: ctx.goHome,
        track,
      });
    }

    function end(reason) {
      st.over = true;
      teardown();
      haptic('lose');
      root.replaceChildren(
        topBar({ onBack: ctx.goHome, backLabel: BACK_LABEL }),
        resultView({
          kicker: data.title || 'Science Challenge',
          visual: scoreRing(st.correct / order.length, `${toBn(st.correct)}/${toBn(order.length)}`, 'সঠিক'),
          title: reason === 'time' ? 'সময় শেষ!' : 'খেলা শেষ!',
          message: `পুরস্কারের জন্য দরকার কমপক্ষে ${toBn(need)}টি সঠিক উত্তর। আরেকবার চেষ্টা করো!`,
          actions: [
            { label: 'আবার খেলো', kind: 'primary', iconName: 'replay', onClick: play },
            { label: 'বইয়ে ফিরে যাও', kind: 'secondary', iconName: 'books', onClick: ctx.goHome },
          ],
        }),
      );
    }
  }

  /** Start-screen demo: a sample picture question answered wrong, then right, then the win rule. */
  function demo() {
    // Sample picture (not one of the real questions): wood floating, a stone on the bottom.
    const picture = () => html(`<svg class="dm-pic" viewBox="0 0 320 210" aria-hidden="true">
      <rect width="320" height="210" rx="14" fill="#fdf3dc"/>
      <rect x="40" y="70" width="240" height="120" rx="8" fill="#a5d8ff" stroke="#4dabf7" stroke-width="5"/>
      <path d="M43 92q30-10 58 0t58 0 58 0 58 0" fill="none" stroke="#e7f5ff" stroke-width="5"/>
      <rect x="70" y="72" width="80" height="34" rx="6" fill="#c0803c" stroke="#7c4a1e" stroke-width="4"/>
      <ellipse cx="220" cy="168" rx="38" ry="22" fill="#868e96" stroke="#495057" stroke-width="4"/>
      <text x="110" y="40" font-size="22" font-weight="700" text-anchor="middle" fill="#7c4a1e">কাঠ</text>
      <text x="220" y="40" font-size="22" font-weight="700" text-anchor="middle" fill="#495057">পাথর</text>
    </svg>`);
    const opt = (letter, text) => h('div', { class: 'dm-opt' }, h('b', {}, letter), text);
    const round = async (screen, api, n, question, options, pick, right) => {
      const opts = options.map((t, i) => opt(LETTERS[i], t));
      screen.replaceChildren(
        h('div', { class: 'dm-bar' }, h('span'), h('span', { class: 'dm-chip' }, `প্রশ্ন ${toBn(n)}/${toBn(perGame)}`), demoClock(bnTime, cfg.timeLimitSeconds - (n - 1) * 9)),
        h('div', { class: 'dm-split' }, h('div', {}, h('p', { class: 'dm-q small' }, question), picture()), h('div', { class: 'dm-opts' }, opts)),
      );
      await api.wait(700);
      await api.tap(opts[pick]);
      opts.forEach((o, i) => o.classList.add(i === pick ? (i === right ? 'ok' : 'bad') : 'dim'));
      await api.wait(400);
      api.hide();
      const p = pick === right
        ? h('div', { class: 'dm-pop yes' }, h('strong', {}, 'সঠিক! দারুণ বৈজ্ঞানিক চিন্তা!'))
        : h('div', { class: 'dm-pop fail' }, h('span', { class: 'dm-boom' }, '💥'), h('strong', { lang: 'en' }, 'Science Fail!'));
      screen.append(p);
      await api.wait(1700);
      p.remove();
      await api.wait(400);
    };
    return demoPlayer({
      label: 'ডেমো: কীভাবে খেলবে',
      lang: 'bn',
      script: async (screen, api) => {
        screen.classList.add('dm-plain');
        await round(screen, api, 1, 'কোনটি পানিতে ভাসছে?', ['পাথর', 'কাঠ', 'দুটিই', 'কোনোটিই না'], 0, 1);
        await round(screen, api, 2, 'কোনটি পানির নিচে ডুবে আছে?', ['কাঠ', 'পাথর', 'দুটিই', 'কোনোটিই না'], 1, 1);
        screen.replaceChildren(h('div', { class: 'dm-end' },
          h('strong', {}, `${toBn(perGame)}টি প্রশ্ন · ${bnTime(cfg.timeLimitSeconds)} মিনিট`),
          h('span', {}, `কমপক্ষে ${toBn(need)}টি সঠিক হলেই পুরস্কার! 🎁`),
        ));
        await api.wait(2600);
      },
    });
  }

  return { destroy: teardown };
}
