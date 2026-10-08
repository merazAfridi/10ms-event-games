/** Game 4 – Science Challenge: picture questions with a twist, 2-minute timer, 2 correct answers win. */
import { h, html, toBn, shuffle, haptic, icon, formatTime, reducedMotion } from '../lib/util.js';
import { topBar, button, scoreRing, resultView } from '../lib/ui.js';
import { showWinScreen } from '../lib/reward.js';
import { countPlay, countWin } from '../lib/attempts.js';

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

const DEFAULTS = { timeLimitSeconds: 120, challengesToWin: 2, shuffleChallenges: true };

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
  const need = Math.max(1, Math.min(cfg.challengesToWin, all.length));
  const fill = (text) => String(text).replace('{time}', bnTime(cfg.timeLimitSeconds)).replace('{target}', toBn(need));
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
          h('li', {}, h('strong', {}, `${toBn(all.length)}টি`), h('span', {}, 'চ্যালেঞ্জ')),
          h('li', {}, h('strong', {}, `${toBn(need)}টি`), h('span', {}, 'সঠিক = পুরস্কার')),
        ),
        h('section', { class: 'card rule-card', style: 'margin-top:14px' },
          h('h2', { class: 'card-label' }, 'খেলার নিয়ম'),
          h('ol', { class: 'steps' }, (data.rules || []).map((r) => h('li', {}, fill(r)))),
        ),
      ),
      h('footer', { class: 'bottom-bar' }, button('শুরু করো', play, { cls: 'big' })),
    );
  }

  function play() {
    teardown();
    const order = cfg.shuffleChallenges ? shuffle(all) : all.slice();
    countPlay('science');
    const st = { i: 0, correct: 0, results: [], deadline: Date.now() + cfg.timeLimitSeconds * 1000, over: false, won: false };

    const timerText = h('span', {}, bnTime(cfg.timeLimitSeconds));
    const timerChip = h('div', { class: 'chip timer', role: 'timer' }, icon('clock'), timerText);
    const correctCount = h('strong', {}, toBn(0));
    const bar = h('div', { class: 'progress-fill', style: 'width:0%' });
    const main = h('main', { class: `scroll quiz${all.some((c) => c.image) ? ' picture-quiz' : ''}` });
    const footer = h('footer', { class: 'bottom-bar', hidden: true });

    root.replaceChildren(
      topBar({
        onBack: ctx.goHome,
        backLabel: BACK_LABEL,
        center: timerChip,
        right: h('div', { class: 'chip' }, 'সঠিক ', correctCount, ` / ${toBn(need)}`),
      }),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, bar),
      main,
      footer,
    );

    const timer = setInterval(tick, 250);
    track(() => clearInterval(timer));
    show();

    function tick() {
      if (st.over || st.won) return;
      const ms = st.deadline - Date.now();
      const left = Math.max(0, Math.ceil(ms / 1000));
      timerText.textContent = bnTime(left);
      timerChip.classList.toggle('low', left <= 20);
      if (ms <= 0) end('time');
    }

    function show() {
      const c = order[st.i];
      const answer = clean(c.answer);
      const options = shuffle([...new Set([answer, ...(c.options || []).map(clean)])]);
      let answered = false;
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
          h('p', { class: 'kicker' }, `চ্যালেঞ্জ ${toBn(st.i + 1)}/${toBn(order.length)}`),
          h('h1', { class: 'q-title' }, c.title),
          c.image && h('img', { class: 'q-image', src: c.image, alt: '', draggable: 'false' }),
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
        bar.style.width = `${((st.i + 1) / order.length) * 100}%`;
        for (const b of buttons) {
          b.disabled = true;
          if (b === chosen) {
            b.classList.add(ok ? 'is-correct' : 'is-wrong');
            b.querySelector('.opt-mark').append(icon(ok ? 'check' : 'cross'));
          } else {
            b.classList.add('is-dim');
          }
        }

        if (ok) {
          st.correct += 1;
          correctCount.textContent = toBn(st.correct);
          if (st.correct >= need) st.won = true; // freezes the timer
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
            h('p', { class: 'fb-meaning' }, 'এই উত্তরটি বৈজ্ঞানিকভাবে ঠিক নয়। পরের চ্যালেঞ্জে আবার চেষ্টা করো!'),
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
      const label = st.won ? 'পুরস্কার দেখো' : last ? 'ফলাফল দেখো' : 'পরবর্তী';
      footer.replaceChildren(button(label, next, { cls: 'big', iconName: 'next' }));
      footer.hidden = false;
    }

    function next() {
      if (st.over) return;
      if (st.won) { win(); return; }
      st.i += 1;
      if (st.i >= order.length) end('done');
      else show();
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
      const used = cfg.timeLimitSeconds - Math.max(0, Math.ceil((st.deadline - Date.now()) / 1000));
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
        rows: [
          ...st.results.filter((r) => r.ok).map((r) => ({ label: r.title, value: '✓', ok: true })),
          { label: 'সময় লেগেছে', value: bnTime(used) },
        ],
        onPlayAgain: play,
        onHome: ctx.goHome,
        track,
      });
    }

    function end(reason) {
      st.over = true;
      teardown();
      haptic('wrong');
      root.replaceChildren(
        topBar({ onBack: ctx.goHome, backLabel: BACK_LABEL }),
        resultView({
          kicker: data.title || 'Science Challenge',
          visual: scoreRing(st.correct / need, `${toBn(st.correct)}/${toBn(need)}`, 'সঠিক'),
          title: reason === 'time' ? 'সময় শেষ!' : 'খেলা শেষ!',
          message: `পুরস্কারের জন্য দরকার ${toBn(need)}টি সঠিক উত্তর। আরেকবার চেষ্টা করো!`,
          extra: st.results.length
            ? h('ol', { class: 'review' }, st.results.map((r, i) =>
              h('li', { class: r.ok ? 'ok' : 'bad' },
                h('span', { class: 'rv-mark' }, icon(r.ok ? 'check' : 'cross')),
                h('div', {}, h('p', { class: 'rv-answer' }, `${toBn(i + 1)}. ${r.title}`)),
              )))
            : h('p', { class: 'muted center' }, 'এবার কোনো উত্তর দেওয়া হয়নি।'),
          actions: [
            { label: 'আবার খেলো', kind: 'primary', iconName: 'replay', onClick: play },
            { label: 'বইয়ে ফিরে যাও', kind: 'secondary', iconName: 'books', onClick: ctx.goHome },
          ],
        }),
      );
    }
  }

  return { destroy: teardown };
}
