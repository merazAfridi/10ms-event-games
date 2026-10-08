/** Game 3 – Math: "Shape Challenge" (draw shapes freehand, 85%+ accuracy, 2 shapes in 2 minutes). */
import { h, html, haptic, icon, formatTime, reducedMotion } from '../lib/util.js';
import { topBar, button, scoreRing, resultView } from '../lib/ui.js';
import { scoreShape, polygonVertices } from '../lib/shape-score.js';
import { showWinScreen } from '../lib/reward.js';
import { countPlay, countWin } from '../lib/attempts.js';
import { demoPlayer, demoClock } from '../lib/demo.js';

const RESULT_PAUSE = 1500; // ms the accuracy stays on screen before moving on
const TIME_UP_GRACE = 4000; // ms a player may finish a stroke that was started before the timer hit 0

const DEFAULTS = {
  timeLimitSeconds: 120,
  shapesToWin: 2,
  maxTries: 10, // drawings allowed per game (0 = no limit)
  passThreshold: 85,
  strictness: 1,
  minDrawingSize: 0.3,
  showScoreDetails: false,
  rewardCodeSecret: '',
  advancedScoring: {},
};

/** Small reference picture of a shape (vertex pointing up, visually centred). */
export function shapeIcon(sides) {
  if (!sides) return html('<svg class="shape-icon" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/></svg>');
  const R = 42;
  const drop = (R - R * Math.cos(Math.PI / sides)) / 2; // centre odd polygons vertically
  const points = polygonVertices(sides, 50, 50 + drop, R, -Math.PI / 2)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  return html(`<svg class="shape-icon" viewBox="0 0 100 100" aria-hidden="true"><polygon points="${points}"/></svg>`);
}


export function mount(root, ctx) {
  const data = ctx.content;
  const cfg = { ...DEFAULTS, ...(ctx.config.math || {}) };
  const shapes = (data.shapes || []).filter((s) => s && (s.sides === 0 || s.sides >= 3));
  const need = Math.max(1, Math.min(cfg.shapesToWin, shapes.length));
  const debug = cfg.showScoreDetails || /[?&]debug\b/.test(location.search + location.hash);
  const scoring = { ...cfg.advancedScoring, strictness: cfg.strictness };

  // Everything that has to be cleaned up when the player leaves or restarts.
  let cleanup = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); cleanup.push(() => clearTimeout(id)); return id; };
  const every = (fn, ms) => { const id = setInterval(fn, ms); cleanup.push(() => clearInterval(id)); return id; };
  const teardown = () => { cleanup.forEach((fn) => fn()); cleanup = []; };

  intro();

  function intro() {
    teardown();
    root.replaceChildren(
      topBar({ onBack: ctx.goHome }),
      h('main', { class: 'scroll intro' },
        h('div', { class: 'intro-hero' },
          h('p', { class: 'kicker' }, 'Math'),
          h('h1', { class: 'intro-title display caps' }, data.title || 'Shape Challenge'),
          h('p', { class: 'intro-sub tagline' }, data.tagline || 'Draw. Focus. Master.'),
        ),
        h('div', { class: 'shape-strip' },
          shapes.map((s) => h('div', { class: 'shape-chip' }, shapeIcon(s.sides), h('span', {}, s.name))),
        ),
        demo(),
      ),
      h('footer', { class: 'bottom-bar' }, button(`Start · ${formatTime(cfg.timeLimitSeconds)}`, play, { cls: 'big' })),
    );
  }

  function play() {
    teardown();
    countPlay('math');
    const st = {
      index: 0,
      completed: new Set(),
      best: new Map(),
      deadline: Date.now() + cfg.timeLimitSeconds * 1000,
      timeOver: false,
      tries: 0,
      over: false,
      busy: null, // 'pass' | 'fail' | 'small' while a result is showing
    };
    let points = [];
    let guide = null;
    let pointerId = null;
    let padRect = null;
    let padSize = 0; // the pad's shorter side (drawing-size check)
    let padW = 0;
    let padH = 0;

    // ----- DOM -----
    const timerText = h('span', {}, formatTime(cfg.timeLimitSeconds));
    const timerChip = h('div', { class: 'chip timer', role: 'timer' }, icon('clock'), timerText);
    const doneCount = h('strong', {}, '0');
    const triesLeft = h('strong', {}, String(cfg.maxTries));
    const targetIcon = h('div', { class: 'target-icon' });
    const targetName = h('strong', { class: 'target-name' });
    const targetMeta = h('span', { class: 'target-meta' });
    const canvas = h('canvas', { class: 'pad', 'aria-label': 'Drawing area' });
    const g = canvas.getContext('2d');
    const hint = h('div', { class: 'pad-hint' }, 'Draw here in one stroke');
    const popNum = h('strong', { class: 'pop-num' });
    const popText = h('span', { class: 'pop-text' });
    const popDetail = h('span', { class: 'pop-detail' });
    const pop = h('div', { class: 'pop', hidden: true, 'aria-live': 'assertive' }, popNum, popText, popDetail);
    const padBox = h('div', { class: 'pad-box' }, canvas, hint, pop);
    const padWrap = h('div', { class: 'pad-wrap' }, padBox);
    const clearBtn = button('Clear', clear, { kind: 'secondary', iconName: 'eraser', cls: 'btn-clear' });
    const skipBtn = button('Skip', skip, { kind: 'secondary', iconName: 'skip', cls: 'btn-skip' });

    root.replaceChildren(
      topBar({
        onBack: ctx.goHome,
        center: h('div', { class: 'math-chips' },
          h('div', { class: 'chip done-chip' }, 'Completed: ', doneCount, ` / ${need}`),
          cfg.maxTries > 0 && h('div', { class: 'chip tries-chip' }, 'Tries left: ', triesLeft),
        ),
        right: timerChip,
      }),
      // What to draw on the left, the pad in the middle, the hint on the right.
      h('div', { class: 'math-stage' },
        h('div', { class: 'target' },
          targetIcon,
          h('div', { class: 'target-text' }, h('span', { class: 'target-label' }, 'Draw a'), targetName),
        ),
        padWrap,
        targetMeta,
      ),
      h('footer', { class: 'bottom-bar two' }, clearBtn, skipBtn),
    );
    showTarget();

    // ----- canvas sizing -----
    const resize = () => {
      const cs = getComputedStyle(padWrap);
      const innerW = padWrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const innerH = padWrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      // A little wider than tall: more room to the left and right of the shape.
      const ph = Math.floor(Math.min(innerH, innerW));
      const w = Math.floor(Math.min(innerW, ph * 1.4));
      if (ph <= 0 || (w === padW && ph === padH)) return;
      padW = w;
      padH = ph;
      padSize = Math.min(w, ph);
      padBox.style.width = `${w}px`;
      padBox.style.height = `${ph}px`;
      const shown = canvas.getBoundingClientRect().width / w || 1; // > 1 on the scaled big-screen stage
      const dpr = Math.min(3, (window.devicePixelRatio || 1) * shown);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(ph * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(padWrap);
    cleanup.push(() => observer.disconnect());
    resize();

    // ----- drawing -----
    const blockTouch = (e) => e.preventDefault(); // belt and braces for iOS: no scroll / zoom while drawing
    canvas.addEventListener('touchstart', blockTouch, { passive: false });
    canvas.addEventListener('touchmove', blockTouch, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pointerId) onUp(e); });

    /** Pointer position in pad pixels (the big-screen stage is scaled, so screen pixels differ). */
    function pos(e) {
      const k = padW / padRect.width || 1;
      return { x: (e.clientX - padRect.left) * k, y: (e.clientY - padRect.top) * k };
    }

    function onDown(e) {
      if (st.over || st.busy || pointerId !== null || !e.isPrimary) return;
      e.preventDefault();
      pointerId = e.pointerId;
      try { canvas.setPointerCapture(pointerId); } catch { /* ignore */ }
      padRect = canvas.getBoundingClientRect();
      points = [pos(e)];
      guide = null;
      hint.hidden = true;
      pop.hidden = true;
      redraw();
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ev of events.length ? events : [e]) {
        const p = pos(ev);
        const last = points[points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 1) continue;
        points.push(p);
        strokeSegment(last, p);
      }
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      finishStroke();
    }

    function onCancel(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      resetPad();
    }

    function strokeSegment(a, b) {
      g.strokeStyle = '#2b2350';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }

    function redraw() {
      g.clearRect(0, 0, padW, padH);
      if (guide) {
        g.save();
        g.setLineDash([10, 9]);
        g.lineWidth = 4;
        g.strokeStyle = guide.pass ? 'rgba(24,147,90,.85)' : 'rgba(211,63,73,.8)';
        g.beginPath();
        const { sides, cx, cy, R, rot } = guide.fit;
        if (!sides) g.arc(cx, cy, R, 0, Math.PI * 2);
        else {
          polygonVertices(sides, cx, cy, R, rot).forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y)));
          g.closePath();
        }
        g.stroke();
        g.restore();
      }
      if (points.length > 1) {
        g.strokeStyle = '#2b2350';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.stroke();
      }
    }

    function resetPad() {
      points = [];
      guide = null;
      pop.hidden = true;
      hint.hidden = false;
      redraw();
    }

    function finishStroke() {
      if (points.length < 3) { resetPad(); return; } // just a tap
      st.tries += 1; // every drawing counts as a try
      triesLeft.textContent = String(Math.max(0, cfg.maxTries - st.tries));
      triesLeft.parentElement.classList.toggle('low', cfg.maxTries - st.tries <= 3);

      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const shape = shapes[st.index];
      const result = extent >= cfg.minDrawingSize * padSize ? scoreShape(points, shape.sides, scoring) : null;

      if (!result) {
        showPop({ kind: 'small', text: 'Draw it bigger!', detail: 'Use more of the drawing area.' });
        haptic('wrong');
        settle('small', 1100);
        return;
      }

      const pass = result.score >= cfg.passThreshold;
      st.best.set(st.index, Math.max(st.best.get(st.index) ?? 0, result.score));
      guide = { fit: result.fit, pass };
      redraw();
      if (pass) {
        st.completed.add(st.index);
        doneCount.textContent = String(st.completed.size);
        haptic('success');
      } else {
        haptic('wrong');
      }
      showPop({
        kind: pass ? 'pass' : 'fail',
        score: result.score,
        text: pass ? 'Shape Completed!' : 'Try Again',
        detail: debug
          ? `shape ${pct(result.shape)} · cover ${pct(result.coverage)} · close ${pct(result.closure)}${shape.sides ? ` · corners ${pct(result.corners)}` : ''}`
          : pass ? '' : tipFor(result, shape),
      });
      settle(pass ? 'pass' : 'fail', RESULT_PAUSE);
    }

    /** Lock the pad while a result is showing, then move on. */
    function settle(kind, ms) {
      st.busy = kind;
      clearBtn.disabled = kind === 'pass';
      skipBtn.disabled = kind === 'pass';
      st.pending = later(() => afterResult(kind), ms);
    }

    function afterResult(kind) {
      st.busy = null;
      clearBtn.disabled = false;
      skipBtn.disabled = false;
      if (st.completed.size >= need) return win();
      if (st.timeOver) return timeUp();
      if (cfg.maxTries > 0 && st.tries >= cfg.maxTries) return timeUp('tries');
      if (kind === 'pass') nextShape();
      else resetPad();
    }

    function clear() {
      if (st.busy === 'pass' || st.over) return;
      if (st.busy) { clearTimeout(st.pending); st.busy = null; }
      resetPad();
    }

    function skip() {
      if (st.busy === 'pass' || st.over) return;
      if (st.busy) { clearTimeout(st.pending); st.busy = null; }
      nextShape();
    }

    /** Index of the next shape that isn't done yet. */
    function upNext() {
      for (let k = 1; k <= shapes.length; k++) {
        const j = (st.index + k) % shapes.length;
        if (!st.completed.has(j)) return j;
      }
      return st.index;
    }

    function nextShape() {
      st.index = upNext();
      resetPad();
      showTarget();
    }

    function showTarget() {
      const s = shapes[st.index];
      targetIcon.replaceChildren(shapeIcon(s.sides));
      targetName.textContent = s.name.toUpperCase();
      targetMeta.textContent = s.sides ? `${s.sides} equal sides` : 'perfectly round';
      const up = shapes[upNext()];
      skipBtn.querySelector('span:last-child').textContent = up && up !== s ? `Skip to ${up.name}` : 'Skip';
      const row = targetIcon.parentElement;
      row.classList.remove('swap');
      void row.offsetWidth; // restart the CSS animation
      row.classList.add('swap');
    }

    function showPop({ kind, score = null, text, detail }) {
      pop.className = `pop ${kind}`;
      pop.hidden = false;
      popText.textContent = text;
      popDetail.textContent = detail || '';
      popDetail.hidden = !detail;
      popNum.hidden = score === null;
      if (score === null) return;
      if (reducedMotion()) { popNum.textContent = `${score}%`; return; }
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 650);
        popNum.textContent = `${Math.round(score * (1 - (1 - t) ** 3))}%`;
        if (t < 1 && !pop.hidden) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // ----- timer -----
    function tickTimer() {
      if (st.over) return;
      const msLeft = st.deadline - Date.now();
      const left = Math.max(0, Math.ceil(msLeft / 1000));
      timerText.textContent = formatTime(left);
      timerChip.classList.toggle('low', left <= 20);
      if (msLeft > 0) return;
      st.timeOver = true;
      if (pointerId !== null && msLeft > -TIME_UP_GRACE) return; // let them finish this stroke
      if (st.busy) return; // afterResult() decides
      timeUp();
    }
    every(tickTimer, 250);

    // ----- endings -----
    function stopPlay() {
      st.over = true;
      pointerId = null;
      teardown();
    }

    function win() {
      stopPlay();
      haptic('win');
      showWin();
    }

    function timeUp(reason) {
      stopPlay();
      haptic('lose');
      const attempted = [...st.best.entries()].map(([i, score]) => ({ name: shapes[i].name, score, done: st.completed.has(i) }));
      root.replaceChildren(
        topBar({ onBack: ctx.goHome }),
        resultView({
          kicker: data.title || 'Shape Challenge',
          visual: scoreRing(st.completed.size / need, `${st.completed.size}/${need}`, 'shapes'),
          title: reason === 'tries' ? 'No tries left!' : data.timeUpTitle || "Time's up!",
          message: data.timeUpMessage,
          extra: attempted.length
            ? h('ul', { class: 'best-list' }, attempted.map((a) =>
              h('li', { class: a.done ? 'ok' : '' }, h('span', {}, a.name), h('strong', {}, `best ${a.score}%`))))
            : h('p', { class: 'muted center' }, 'No shapes were drawn this time.'),
          actions: [
            { label: 'Play Again', kind: 'primary', iconName: 'replay', onClick: play },
            { label: 'Back to Books', kind: 'secondary', iconName: 'books', onClick: ctx.goHome },
          ],
        }),
      );
    }
  }

  function showWin() {
    showWinScreen(root, {
      secret: cfg.rewardCodeSecret,
      device: countWin('math'),
      labels: {
        ...(data.winTitle && { title: data.winTitle }),
        ...(data.winMessage && { message: data.winMessage }),
      },
      onPlayAgain: play,
      onHome: ctx.goHome,
      track: (fn) => cleanup.push(fn),
    });
  }

  /** Start-screen demo: a finger draws a circle in one stroke, the score pops up, then the win rule. */
  function demo() {
    const SVG = 'http://www.w3.org/2000/svg';
    return demoPlayer({
      label: 'Demo: how to play',
      lang: 'en',
      script: async (screen, api) => {
        const done = h('b', {}, '0');
        const line = document.createElementNS(SVG, 'polyline');
        line.setAttribute('class', 'dm-ink');
        const svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('viewBox', '0 0 200 200');
        svg.append(line);
        const pad = h('div', { class: 'dm-pad' }, svg);
        screen.replaceChildren(
          h('div', { class: 'dm-bar' }, h('span'), h('span', { class: 'dm-chip' }, 'Completed: ', done, ` / ${need}`), demoClock(formatTime, cfg.timeLimitSeconds)),
          h('div', { class: 'dm-target' }, h('span', {}, 'Draw a'), h('strong', {}, 'CIRCLE')),
          pad,
        );
        await api.wait(600);
        // Pad coordinates (0-200) to frame coordinates for the hand.
        const box = () => { const a = api.point(pad); return { x: a.x - pad.offsetWidth / 2, y: a.y - pad.offsetHeight / 2, s: pad.offsetWidth / 200 }; };
        const at = (deg) => ({ x: 100 + 70 * Math.cos(deg * Math.PI / 180) + (deg > 200 ? 3 : 0), y: 100 + 68 * Math.sin(deg * Math.PI / 180) });
        const toFrame = (p) => { const b = box(); return { x: b.x + p.x * b.s, y: b.y + p.y * b.s }; };
        await api.move(toFrame(at(-90)), 700);
        const pts = [];
        for (let deg = -90; deg <= 272; deg += 12) {
          const p = at(deg);
          pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
          line.setAttribute('points', pts.join(' '));
          await api.move(toFrame(p), 55);
        }
        api.hide();
        await api.wait(300);
        screen.append(h('div', { class: 'dm-pop score' }, h('strong', {}, '92%'), h('span', {}, 'Circle done! ✓')));
        done.textContent = '1';
        await api.wait(1800);
        screen.replaceChildren(h('div', { class: 'dm-end' },
          h('strong', {}, 'Draw each shape in one stroke'),
          h('span', {}, `${need} shapes in ${formatTime(cfg.timeLimitSeconds)}${cfg.maxTries ? `, ${cfg.maxTries} tries` : ''} = gift! 🎁`),
        ));
        await api.wait(2400);
      },
    });
  }

  return { destroy: teardown };
}

const pct = (v) => `${Math.round(v * 100)}%`;

function tipFor(result, shape) {
  if (result.closure < 0.9) return 'Finish where you started to close the shape.';
  if (result.coverage < 0.9) return shape.sides ? `Draw all ${shape.sides} corners.` : 'Go all the way round.';
  if (shape.sides && result.corners < 0.6) return 'Make sharper corners and straighter sides.';
  return shape.sides ? 'Keep every side the same length.' : 'Keep it round and even.';
}
