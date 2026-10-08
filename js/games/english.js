/** Game 2 – English: "Verb Hunt!" (pick a level, tap every verb, 85% accuracy on that level wins). */
import { h, haptic, icon, formatTime } from '../lib/util.js';
import { topBar, button, scoreRing, resultView } from '../lib/ui.js';
import { showWinScreen } from '../lib/reward.js';
import { countPlay, countWin } from '../lib/attempts.js';
import { demoPlayer, demoClock } from '../lib/demo.js';

// A word: letters/digits, with optional apostrophe parts (don't, Rafi's) and hyphen parts (well-known).
const WORD = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*(?:-[A-Za-z0-9]+)*/g;

export function splitSentences(paragraph) {
  const text = String(paragraph || '').replace(/\s+/g, ' ').trim();
  return (text.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g) || []).map((s) => s.trim()).filter(Boolean);
}

/**
 * Turn a level from english.json into tappable tokens and mark the verbs.
 * Verbs are matched per sentence (so a repeated word is only marked where it is a verb).
 */
export function parseLevel(level) {
  const sentences = Array.isArray(level.sentences) ? level.sentences.map(String) : splitSentences(level.paragraph);
  const answers = Array.isArray(level.answers) ? level.answers : [];
  const tokens = [];
  const problems = [];

  if (answers.length !== sentences.length) {
    problems.push(`The answer key has ${answers.length} sentence lists, but the paragraph has ${sentences.length} sentences.`);
  }

  sentences.forEach((sentence, s) => {
    const words = [];
    for (const chunk of sentence.split(' ').filter(Boolean)) {
      const matches = [...chunk.matchAll(WORD)];
      if (!matches.length) {
        // Punctuation on its own (e.g. a dash): attach it to the previous word.
        if (tokens.length) tokens[tokens.length - 1].trail += ` ${chunk}`;
        continue;
      }
      let pos = 0;
      matches.forEach((m, k) => {
        const lead = chunk.slice(pos, m.index);
        pos = m.index + m[0].length;
        const trail = k === matches.length - 1 ? chunk.slice(pos) : '';
        const token = { s, text: m[0], lead, trail, verb: false };
        tokens.push(token);
        words.push(token);
      });
    }

    for (const raw of answers[s] || []) {
      // "word?" = arguable word (e.g. "dressed" in "gets dressed"): tapping it or not are both fine.
      const optional = String(raw).trim().endsWith('?');
      const [word, nth] = String(raw).trim().replace(/\?$/, '').split('#');
      const target = word.replace(/[^A-Za-z0-9'’-]/g, '').toLowerCase();
      const same = words.filter((t) => t.text.toLowerCase() === target);
      const token = nth ? same[Number(nth) - 1] : same.find((t) => !t.verb && !t.optional);
      if (!token) problems.push(`Sentence ${s + 1}: "${raw}" was not found in "${sentence}"`);
      else if (optional) token.optional = true;
      else token.verb = true;
    }
  });

  return { tokens, total: tokens.filter((t) => t.verb).length, problems };
}

const DEFAULTS = { passAccuracy: 85, timeLimitSeconds: 0 };

export function mount(root, ctx) {
  const data = ctx.content;
  const cfg = { ...DEFAULTS, ...(ctx.config.english || {}) };
  const secret = ctx.config.math?.rewardCodeSecret || ctx.config.rewardCodeSecret || '';
  const levels = (data.levels || []).map((level, i) => ({ ...level, number: i + 1, parsed: parseLevel(level) }));
  const limit = Math.max(0, Number(cfg.timeLimitSeconds) || 0);
  let timer = 0;
  let cleanup = [];
  const track = (fn) => cleanup.push(fn);
  const teardown = () => { clearInterval(timer); cleanup.forEach((fn) => fn()); cleanup = []; };

  let chosen = levels[0];

  intro();

  function intro() {
    teardown();
    const cards = levels.map((level) =>
      h('button', {
        class: 'level-card',
        type: 'button',
        'aria-pressed': String(level === chosen),
        onclick: () => {
          chosen = level;
          cards.forEach((c, i) => c.setAttribute('aria-pressed', String(levels[i] === chosen)));
          startBtn.querySelector('span:last-child').textContent = single ? 'Start' : `Start Level ${chosen.number}`;
          haptic('tap');
        },
      },
        h('span', { class: 'level-num' }, h('small', {}, 'Level'), String(level.number)),
        h('span', { class: 'level-info' },
          h('strong', {}, level.title || `Level ${level.number}`),
          h('span', {},
            `${level.parsed.total} verbs`,
            level.difficulty && ` · ${level.difficulty}`,
            level.parsed.problems.length > 0 && ' · ⚠ check answer key',
          ),
        ),
        h('span', { class: 'pick', 'aria-hidden': 'true' }, icon('check')),
      ),
    );
    const single = levels.length === 1; // one story: nothing to pick
    const startBtn = button(single ? 'Start' : `Start Level ${chosen.number}`, () => start(chosen), { cls: 'big', iconName: 'next' });
    root.replaceChildren(
      topBar({ onBack: ctx.goHome }),
      h('main', { class: 'scroll intro' },
        h('div', { class: 'intro-hero' },
          h('p', { class: 'kicker' }, 'English'),
          h('h1', { class: 'intro-title display' }, data.title || 'Verb Hunt!'),
          data.tagline && h('p', { class: 'intro-sub' }, data.tagline),
        ),
        h('ul', { class: 'facts' },
          single
            ? h('li', {}, h('strong', {}, String(chosen.parsed.total)), h('span', {}, 'verbs'))
            : h('li', {}, h('strong', {}, String(levels.length)), h('span', {}, 'levels')),
          single && limit
            ? h('li', {}, h('strong', {}, formatTime(limit)), h('span', {}, 'minutes'))
            : h('li', {}, h('strong', {}, '1'), h('span', {}, 'to finish')),
          h('li', {}, h('strong', {}, `${cfg.passAccuracy}%`), h('span', {}, '= gift')),
        ),
        demo(),
        !single && h('h2', { class: 'section-title' }, 'Choose a level'),
        !single && h('div', { class: 'level-list', role: 'group', 'aria-label': 'Choose a level' }, cards),
      ),
      h('footer', { class: 'bottom-bar' }, startBtn),
    );
  }

  /** A run is one level: the one the player picked. */
  function start(first = chosen) {
    teardown();
    chosen = first;
    const runLevels = [first];
    countPlay('english');
    const run = { startedAt: Date.now(), results: [], over: false, levels: runLevels };
    run.total = runLevels.reduce((sum, l) => sum + l.parsed.total, 0);
    run.deadline = limit ? run.startedAt + limit * 1000 : 0;
    play(first, run);
  }

  function play(level, run) {
    const { tokens, total, problems } = level.parsed;
    const selected = new Set();
    let checked = false;
    const elapsed = () => Math.floor((Date.now() - run.startedAt) / 1000);
    const remaining = () => Math.max(0, Math.ceil((run.deadline - Date.now()) / 1000));
    const clockText = () => formatTime(limit ? remaining() : elapsed());

    const foundCount = h('strong', {}, '0');
    const clock = h('span', { class: 'timer-text' }, clockText());
    const timerChip = h('div', { class: 'chip timer', role: 'timer' }, icon('clock'), clock);
    const summary = h('div', { class: 'stats', hidden: true, style: 'margin:0 0 12px' });
    const tokenEls = tokens.map((t, i) =>
      h('span', { class: 'tok', role: 'button', 'aria-pressed': 'false', dataset: { i: String(i) } },
        t.lead && h('span', { class: 'p' }, t.lead),
        h('span', { class: 'w' }, t.text),
        t.trail && h('span', { class: 'p' }, t.trail),
      ),
    );
    const para = h('div', { class: 'para', lang: 'en', onclick: onTap }, tokenEls);
    const legend = h('div', { class: 'legend', hidden: true },
      h('span', { class: 'lg correct' }, 'Correct'),
      h('span', { class: 'lg wrong' }, 'Wrong'),
      h('span', { class: 'lg missed' }, 'Missed'),
    );
    const footer = h('footer', { class: 'bottom-bar' },
      button('Check', check, { cls: 'big', iconName: 'check' }),
    );

    const main = h('main', { class: 'scroll hunt' },
      h('p', { class: 'level-heading' }, levels.length > 1 && `Level ${level.number} of ${levels.length} · `, h('strong', {}, level.title || '')),
      problems.length > 0 && h('div', { class: 'warn-card' },
        h('strong', {}, 'Answer key problem – please fix content/english.json:'),
        h('ul', {}, problems.map((p) => h('li', {}, p))),
      ),
      summary,
      legend,
      h('article', { class: 'card para-card' }, para),
    );

    root.replaceChildren(
      topBar({
        onBack: ctx.goHome,
        center: h('div', { class: 'counter', 'aria-live': 'polite' }, 'Verbs found: ', foundCount, ` / ${total}`),
        right: timerChip,
      }),
      main,
      footer,
    );

    clearInterval(timer);
    timer = setInterval(tick, 250);
    tick();

    function tick() {
      if (run.over) return;
      clock.textContent = clockText();
      if (!limit) return;
      timerChip.classList.toggle('low', remaining() <= 20);
      if (Date.now() >= run.deadline) {
        // Time is up: score what is selected on this level, then finish (unplayed levels count as missed).
        run.over = true;
        if (!checked) check();
        finish(run, 'time');
      }
    }

    function onTap(e) {
      if (checked) return;
      const el = e.target.closest('.tok');
      if (!el) return;
      const i = Number(el.dataset.i);
      if (selected.has(i)) selected.delete(i);
      else selected.add(i);
      const on = selected.has(i);
      el.classList.toggle('sel', on);
      el.setAttribute('aria-pressed', String(on));
      foundCount.textContent = String(selected.size);
      haptic('tap');
    }

    function check() {
      if (checked) return;
      checked = true;
      let correct = 0;
      let wrong = 0;
      let missed = 0;
      tokens.forEach((t, i) => {
        const el = tokenEls[i];
        const picked = selected.has(i);
        el.classList.remove('sel');
        if (picked && t.verb) { correct += 1; el.classList.add('correct'); }
        else if (picked && t.optional) el.classList.add('correct'); // arguable word: no penalty either way
        else if (picked) { wrong += 1; el.classList.add('wrong'); }
        else if (t.verb) { missed += 1; el.classList.add('missed'); }
      });
      para.classList.add('checked');
      legend.hidden = false;
      run.results.push({ level, correct, wrong, missed, total });
      if (run.over) return;
      haptic(correct === total && !wrong ? 'win' : wrong > correct ? 'wrong' : 'success');

      // Show this level's result on top of the coloured story, so players can review it before moving on.
      summary.replaceChildren(
        stat('correct', correct, 'Correct'),
        stat('wrong', wrong, 'Wrong'),
        stat('missed', missed, 'Missed'),
        stat('time', pct(total ? Math.max(0, correct - wrong) / total : 0), 'Accuracy'),
      );
      summary.hidden = false;
      main.scrollTop = 0;

      const nextLevel = run.levels[run.levels.indexOf(level) + 1];
      footer.replaceChildren(nextLevel
        ? button(`Next: Level ${nextLevel.number}`, () => play(nextLevel, run), { cls: 'big', iconName: 'next' })
        : button('See result', () => finish(run, 'done'), { cls: 'big', iconName: 'next' }));
    }
  }

  /** Accuracy: (correct − wrong) ÷ all verbs in the level played. */
  function accuracy(run) {
    const correct = run.results.reduce((sum, r) => sum + r.correct, 0);
    const wrong = run.results.reduce((sum, r) => sum + r.wrong, 0);
    return run.total ? Math.max(0, correct - wrong) / run.total : 0;
  }

  function finish(run, reason) {
    run.over = true;
    teardown();
    const ratio = accuracy(run);
    const seconds = Math.min(Math.floor((Date.now() - run.startedAt) / 1000), limit || Infinity);
    const rows = run.levels.map((l) => {
      const r = run.results.find((x) => x.level === l);
      return {
        label: `Level ${l.number} · ${l.title || ''}`,
        value: r ? `${Math.max(0, r.correct - r.wrong)} / ${r.total}` : 'not played',
        ok: Boolean(r) && r.correct === r.total && !r.wrong,
      };
    });

    if (ratio * 100 >= cfg.passAccuracy) {
      haptic('win');
      showWinScreen(root, {
        secret,
        device: countWin('english'),
        labels: { title: data.winTitle || 'Verb Hunt Complete!' },
        rows: [...(levels.length > 1 ? rows : []), { label: 'Accuracy', value: pct(ratio), ok: true }, { label: 'Time', value: formatTime(seconds) }], // one story: its score is the accuracy
        onPlayAgain: intro,
        onHome: ctx.goHome,
        track,
      });
      return;
    }

    haptic('lose');
    root.replaceChildren(
      topBar({ onBack: ctx.goHome }),
      resultView({
        kicker: data.title || 'Verb Hunt!',
        visual: scoreRing(ratio, pct(ratio), 'accuracy'),
        title: reason === 'time' ? 'Time’s up!' : 'Hunt complete!',
        message: `You need ${cfg.passAccuracy}% accuracy for the surprise gift. Verbs are sneaky – try again!`,
        extra: h('ul', { class: 'best-list' },
          [...rows, { label: 'Time', value: formatTime(seconds) }].map((r) =>
            h('li', { class: r.ok ? 'ok' : '' }, h('span', {}, r.label), h('strong', {}, r.value))),
        ),
        actions: [
          { label: 'Play Again', kind: 'primary', iconName: 'replay', onClick: intro },
          { label: 'Back to Books', kind: 'secondary', iconName: 'books', onClick: ctx.goHome },
        ],
      }),
    );
  }

  function stat(kind, value, label) {
    return h('div', { class: `stat ${kind}` }, h('strong', {}, String(value)), h('span', {}, label));
  }

  /** Start-screen demo on a sample story: tap verbs (one wrong tap), press Check, see the colours. */
  function demo() {
    const story = [['Mina', 0], ['opens', 1], ['the', 0], ['door', 0], ['and', 0], ['sees', 1], ['a', 0], ['small', 0], ['cat.', 0], ['The', 0], ['cat', 0], ['jumps', 1], ['on', 0], ['the', 0], ['bed.', 0]];
    return demoPlayer({
      label: 'Demo: how to play',
      lang: 'en',
      script: async (screen, api) => {
        const found = h('b', {}, '0');
        const words = story.map(([w]) => h('span', { class: 'dm-w' }, w));
        const check = h('div', { class: 'dm-btn' }, '✓ Check');
        screen.replaceChildren(
          h('div', { class: 'dm-bar' }, h('span'), h('span', { class: 'dm-chip' }, 'Verbs found: ', found, ' / 3'), limit ? demoClock(formatTime, limit) : h('span')),
          h('p', { class: 'dm-para' }, words.flatMap((w, i) => (i ? [' ', w] : [w]))),
          check,
        );
        await api.wait(700);
        let n = 0;
        for (const i of [1, 5, 7]) { // two verbs and one wrong word ("small"); "jumps" gets missed
          await api.tap(words[i]);
          words[i].classList.add('sel');
          found.textContent = String(++n);
          await api.wait(250);
        }
        await api.tap(check);
        api.hide();
        story.forEach(([, verb], i) => {
          const picked = words[i].classList.contains('sel');
          if (verb && picked) words[i].classList.add('ok');
          else if (picked) words[i].classList.add('bad');
          else if (verb) words[i].classList.add('miss');
        });
        screen.append(h('div', { class: 'dm-legend' }, h('span', { class: 'ok' }, 'Correct'), h('span', { class: 'bad' }, 'Wrong'), h('span', { class: 'miss' }, 'Missed')));
        await api.wait(2400);
        screen.replaceChildren(h('div', { class: 'dm-end' },
          h('strong', {}, 'Tap every verb, then press Check'),
          h('span', {}, `Reach ${cfg.passAccuracy}% to win a gift! 🎁`),
        ));
        await api.wait(2400);
      },
    });
  }

  return { destroy: teardown };
}

const pct = (ratio) => `${Math.round(ratio * 100)}%`;
