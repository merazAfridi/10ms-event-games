/**
 * Shape accuracy scoring for the Math "Shape Challenge".
 *
 * Pure functions with no DOM access, so the same file runs in the browser
 * and in Node (for calibration tests).
 *
 * Pipeline (matches the spec):
 *   1. Resample the stroke into 128 evenly spaced points.
 *   2. Normalise: centroid -> origin, mean radius -> 1.
 *   3. Fit the ideal shape (circle or regular polygon) at the same size,
 *      testing rotations every 2°, then fine-tune centre / size / rotation.
 *      If the player went round more than once, the extra tail is trimmed
 *      and the fit is repeated so the overlap doesn't skew the centre.
 *   4. Shape error = mean distance from each drawn point to the ideal outline.
 *   5. Coverage = the stroke passes near every vertex (circle: every 10° slice).
 *   6. Closure = the stroke's start and end meet.
 *   7. Corners (polygons only) = the stroke actually turns at the vertices,
 *      so a plain circle can't pass as an octagon.
 *   All factors are multiplied into a 0–100 score.
 */

const TAU = Math.PI * 2;

export const DEFAULT_SCORING = {
  samples: 128,          // points the stroke is resampled to
  rotationStepDeg: 2,    // coarse rotation search step
  strictness: 1,         // > 1 harder, < 1 easier; divides every tolerance below
  errorTolerance: 0.25,  // mean outline error (as a fraction of the shape's radius) that scores 0
  vertexNear: 0.12,      // a vertex is fully covered when the stroke passes within this distance…
  vertexFar: 0.32,       // …and not covered at all beyond this distance
  circleBins: 36,        // circle coverage is checked in 10° slices
  circleBand: 0.35,      // a slice only counts if the stroke there is this close to the outline
  closureGap: 0.15,      // start/end gap that costs nothing
  closurePenalty: 0.8,   // score lost per unit of extra gap
  cornerWeight: 0.25,    // max score lost when a polygon is drawn with no corners at all
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** Step 1: resample a polyline into n points evenly spaced along its length. */
export function resample(pts, n) {
  const step = pathLength(pts) / (n - 1);
  const out = [{ x: pts[0].x, y: pts[0].y }];
  if (step === 0) {
    while (out.length < n) out.push({ ...out[0] });
    return out;
  }
  let acc = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length && out.length < n; i++) {
    const cur = pts[i];
    let d = dist(prev, cur);
    while (acc + d >= step && d > 0 && out.length < n) {
      const t = (step - acc) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      prev = q;
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  const last = pts[pts.length - 1];
  while (out.length < n) out.push({ x: last.x, y: last.y });
  return out;
}

/** Step 2: centroid to origin, mean distance from centre to 1. */
function normalize(pts) {
  let cx = 0;
  let cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length;
  cy /= pts.length;
  let r = 0;
  for (const p of pts) r += Math.hypot(p.x - cx, p.y - cy);
  const s = r / pts.length || 1;
  return { pts: pts.map((p) => ({ x: (p.x - cx) / s, y: (p.y - cy) / s })), cx, cy, s };
}

/** Mean distance from centre to the outline of a regular n-gon with circumradius 1. */
function polygonMeanRadius(n) {
  const a = Math.cos(Math.PI / n); // apothem
  const half = Math.sin(Math.PI / n); // half an edge
  const F = (s) => (s * Math.sqrt(a * a + s * s) + a * a * Math.asinh(s / a)) / 2;
  return (F(half) - F(-half)) / (2 * half);
}

/** Vertices of a regular polygon. rot = angle of vertex 0 (radians, y axis pointing down). */
export function polygonVertices(sides, cx, cy, R, rot) {
  const v = [];
  for (let k = 0; k < sides; k++) {
    const a = rot + (k * TAU) / sides;
    v.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return v;
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Step 4: mean distance from the points to the ideal outline. */
function meanError(pts, shape) {
  let sum = 0;
  if (!shape.sides) {
    for (const p of pts) sum += Math.abs(Math.hypot(p.x - shape.cx, p.y - shape.cy) - shape.R);
    return sum / pts.length;
  }
  const v = polygonVertices(shape.sides, shape.cx, shape.cy, shape.R, shape.rot);
  const n = v.length;
  for (const p of pts) {
    let best = Infinity;
    for (let k = 0; k < n; k++) {
      const d = segmentDistance(p, v[k], v[(k + 1) % n]);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / pts.length;
}

/** Step 3: best-fitting ideal shape for normalised points. */
function fitShape(pts, sides, opts) {
  const m = sides ? polygonMeanRadius(sides) : 1;
  let best = { sides, cx: 0, cy: 0, R: 1 / m, rot: 0 };
  let bestErr = meanError(pts, best);

  // Coarse search over every distinct orientation (a regular n-gon repeats every 360°/n).
  if (sides) {
    const period = TAU / sides;
    const step = (opts.rotationStepDeg * Math.PI) / 180;
    for (let rot = step; rot < period; rot += step) {
      const cand = { ...best, rot };
      const e = meanError(pts, cand);
      if (e < bestErr) { bestErr = e; best = cand; }
    }
  }

  // Fine-tune centre, size and rotation with a simple pattern search.
  const steps = { cx: 0.06, cy: 0.06, R: 0.06, rot: sides ? (1.5 * Math.PI) / 180 : 0 };
  const keys = sides ? ['cx', 'cy', 'R', 'rot'] : ['cx', 'cy', 'R'];
  for (let iter = 0; iter < 120; iter++) {
    let improved = false;
    for (const k of keys) {
      for (const dir of [1, -1]) {
        const cand = { ...best };
        if (k === 'R') cand.R = best.R * (1 + dir * steps.R);
        else cand[k] = best[k] + dir * steps[k];
        const e = meanError(pts, cand);
        if (e < bestErr - 1e-12) { bestErr = e; best = cand; improved = true; break; }
      }
    }
    if (!improved) {
      for (const k of keys) steps[k] /= 2;
      if (steps.cx < 0.002) break;
    }
  }
  return { shape: best, err: bestErr, unit: best.R * m };
}

/** Cumulative angle swept around (cx, cy) at each point. */
function sweep(pts, cx, cy) {
  const out = [0];
  let prev = Math.atan2(pts[0].y - cy, pts[0].x - cx);
  let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i].y - cy, pts[i].x - cx);
    let d = a - prev;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    cum += d;
    out.push(cum);
    prev = a;
  }
  return out;
}

/** Step 6: how far apart the two ends of the stroke are (overshoot counts as closed). */
function closureGap(pts) {
  const n = pts.length;
  const start = pts[0];
  const end = pts[n - 1];
  const k = Math.floor(n * 0.25);
  let gap = dist(start, end);
  for (let i = n - k; i < n; i++) gap = Math.min(gap, dist(start, pts[i]));
  for (let i = 0; i < k; i++) gap = Math.min(gap, dist(end, pts[i]));
  return gap;
}

/** Step 5 (polygon): how well the stroke reaches every vertex. */
function vertexCoverage(pts, verts, unit, o) {
  const near = o.vertexNear / o.strictness;
  const far = o.vertexFar / o.strictness;
  let sum = 0;
  for (const v of verts) {
    let d = Infinity;
    for (const p of pts) d = Math.min(d, dist(p, v));
    sum += clamp01((far - d / unit) / (far - near));
  }
  return sum / verts.length;
}

/** Step 5 (circle): fraction of 10° slices the stroke passes through near the outline. */
function circleCoverage(pts, shape, o) {
  const bins = new Array(o.circleBins).fill(false);
  const band = o.circleBand / o.strictness;
  for (const p of pts) {
    const r = Math.hypot(p.x - shape.cx, p.y - shape.cy);
    if (Math.abs(r - shape.R) / shape.R > band) continue;
    const a = (Math.atan2(p.y - shape.cy, p.x - shape.cx) + TAU) % TAU;
    bins[Math.min(o.circleBins - 1, Math.floor((a / TAU) * o.circleBins))] = true;
  }
  return bins.filter(Boolean).length / o.circleBins;
}

/**
 * Step 7 (polygon): does the stroke actually turn a corner at each vertex?
 * Compares the direction change across each vertex with what a sharp corner
 * (360°/n) and a smooth circle would give over the same stretch of stroke.
 */
function cornerSharpness(pts, verts, sides, closed) {
  const n = pts.length;
  const w = Math.max(2, Math.round((n / sides) * 0.35));
  const sharp = (TAU / sides) * 0.85;
  const round = (w * TAU) / n;
  const at = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[Math.max(0, Math.min(n - 1, i))];
  };
  let sum = 0;
  for (const v of verts) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = dist(pts[i], v);
      if (d < bd) { bd = d; bi = i; }
    }
    const a = at(bi - w);
    const b = pts[bi];
    const c = at(bi + w);
    const ux = b.x - a.x, uy = b.y - a.y;
    const vx = c.x - b.x, vy = c.y - b.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (!lu || !lv) continue;
    const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv))));
    sum += clamp01((turn - round) / (sharp - round));
  }
  return sum / sides;
}

/**
 * Score a freehand stroke against a target shape.
 * @param {{x:number,y:number}[]} rawPoints  stroke in any coordinate system
 * @param {number} sides  0 for a circle, otherwise number of polygon sides
 * @param {object} [options]  overrides for DEFAULT_SCORING
 * @returns {{score:number, shape:number, coverage:number, closure:number, corners:number,
 *            error:number, fit:{sides:number,cx:number,cy:number,R:number,rot:number}} | null}
 */
export function scoreShape(rawPoints, sides, options = {}) {
  const o = { ...DEFAULT_SCORING, ...options };
  if (!(o.strictness > 0)) o.strictness = 1;
  const pts = rawPoints.filter((p, i) => i === 0 || dist(p, rawPoints[i - 1]) > 0);
  if (pts.length < 5 || pathLength(pts) === 0) return null;

  // 1–3: resample, normalise, fit
  let P = resample(pts, o.samples);
  let N = normalize(P);
  let fit = fitShape(N.pts, sides, o);

  // Went round more than once? Keep only the first full lap and fit again.
  const cum = sweep(N.pts, fit.shape.cx, fit.shape.cy);
  const total = cum[cum.length - 1];
  if (Math.abs(total) > TAU * 1.04) {
    const sign = Math.sign(total);
    const cut = cum.findIndex((c) => c * sign >= TAU);
    if (cut > 8) {
      P = resample(P.slice(0, cut + 1), o.samples);
      N = normalize(P);
      fit = fitShape(N.pts, sides, o);
    }
  }

  const { shape, unit } = fit;
  const Q = N.pts;

  // 4: shape error
  const error = fit.err / unit;
  const shapeScore = clamp01(1 - (error * o.strictness) / o.errorTolerance);

  // 6: closure
  const gap = closureGap(Q) / unit;
  const closure = clamp01(1 - Math.max(0, gap - o.closureGap / o.strictness) * o.closurePenalty);

  // 5 + 7: coverage and corners
  let coverage;
  let corners = 1;
  if (sides) {
    const verts = polygonVertices(sides, shape.cx, shape.cy, shape.R, shape.rot);
    coverage = vertexCoverage(Q, verts, unit, o);
    corners = cornerSharpness(Q, verts, sides, gap < 0.35);
  } else {
    coverage = circleCoverage(Q, shape, o);
  }
  const cornerFactor = 1 - o.cornerWeight * (1 - corners);

  const score = Math.round(100 * shapeScore * coverage * closure * cornerFactor);

  return {
    score,
    shape: shapeScore,
    coverage,
    closure,
    corners,
    error,
    // Best-fit ideal shape in the caller's coordinates (for drawing a guide overlay).
    fit: {
      sides,
      cx: N.cx + shape.cx * N.s,
      cy: N.cy + shape.cy * N.s,
      R: shape.R * N.s,
      rot: shape.rot,
    },
  };
}
