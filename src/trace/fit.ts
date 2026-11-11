/** Fit a closed outline with cubic Béziers, keeping sharp corners (trace tool spec §3.3; Schneider 1990). */
import type { PathNode } from '../editor/model';
import type { Vec2 } from '../sheet/layout';

type Bez = [Vec2, Vec2, Vec2, Vec2];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const unit = (a: Vec2): Vec2 => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0]; };

function bez(b: Bez, t: number): Vec2 {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * b[0][k] + 3 * u * u * t * b[1][k] + 3 * u * t * t * b[2][k] + t * t * t * b[3][k]) as Vec2;
}
function bezD1(b: Bez, t: number): Vec2 {
  const u = 1 - t;
  return [0, 1].map((k) => 3 * u * u * (b[1][k] - b[0][k]) + 6 * u * t * (b[2][k] - b[1][k]) + 3 * t * t * (b[3][k] - b[2][k])) as Vec2;
}
function bezD2(b: Bez, t: number): Vec2 {
  const u = 1 - t;
  return [0, 1].map((k) => 6 * u * (b[2][k] - 2 * b[1][k] + b[0][k]) + 6 * t * (b[3][k] - 2 * b[2][k] + b[1][k])) as Vec2;
}

function chordParams(pts: Vec2[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

function generate(pts: Vec2[], u: number[], t1: Vec2, t2: Vec2): Bez {
  const p0 = pts[0], p3 = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i], s = 1 - t;
    const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, b2);
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
    const tmp = sub(pts[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp); x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = det !== 0 ? (x0 * c11 - c01 * x1) / det : 0;
  let alpha2 = det !== 0 ? (c00 * x1 - x0 * c01) / det : 0;
  const seg = len(sub(p3, p0)), eps = 1e-6 * seg;
  if (alpha1 < eps || alpha2 < eps) alpha1 = alpha2 = seg / 3; // Wu/Barsky heuristic fallback
  return [p0, add(p0, mul(t1, alpha1)), add(p3, mul(t2, alpha2)), p3];
}

function maxError(pts: Vec2[], b: Bez, u: number[]): { err: number; at: number } {
  let err = 0, at = (pts.length / 2) | 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len(sub(bez(b, u[i]), pts[i]));
    if (d > err) { err = d; at = i; }
  }
  return { err, at };
}

function reparam(pts: Vec2[], u: number[], b: Bez): number[] {
  return u.map((t, i) => {
    const d = sub(bez(b, t), pts[i]), d1 = bezD1(b, t), d2 = bezD2(b, t);
    const den = dot(d1, d1) + dot(d, d2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.min(1, Math.max(0, t - dot(d, d1) / den));
  });
}

function fitCubic(pts: Vec2[], t1: Vec2, t2: Vec2, error: number, out: Bez[], depth = 0) {
  if (pts.length === 2) {
    const d = len(sub(pts[1], pts[0])) / 3;
    out.push([pts[0], add(pts[0], mul(t1, d)), add(pts[1], mul(t2, d)), pts[1]]);
    return;
  }
  let u = chordParams(pts);
  let b = generate(pts, u, t1, t2);
  let { err, at } = maxError(pts, b, u);
  if (err <= error) { out.push(b); return; }
  if (err <= error * 4) {
    for (let k = 0; k < 6; k++) {
      u = reparam(pts, u, b);
      b = generate(pts, u, t1, t2);
      ({ err, at } = maxError(pts, b, u));
      if (err <= error) { out.push(b); return; }
    }
  }
  if (depth > 40 || pts.length < 4) { out.push(b); return; }
  at = Math.min(pts.length - 2, Math.max(1, at));
  const centre = unit(sub(pts[at - 1], pts[at + 1]));
  fitCubic(pts.slice(0, at + 1), t1, centre, error, out, depth + 1);
  fitCubic(pts.slice(at), mul(centre, -1), t2, error, out, depth + 1);
}

/** Indices of sharp corners on a closed polyline. */
export function findCorners(pts: Vec2[], k = 3, minTurnDeg = 60): number[] {
  const n = pts.length;
  if (n < 2 * k + 3) return [];
  const turn = pts.map((p, i) => {
    const a = unit(sub(p, pts[(i - k + n) % n])), b = unit(sub(pts[(i + k) % n], p));
    return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * (180 / Math.PI);
  });
  const corners: number[] = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < minTurnDeg) continue;
    let isMax = true;
    for (let d = -k; d <= k && isMax; d++) {
      if (d === 0) continue;
      const j = (i + d + n) % n;
      if (turn[j] > turn[i] || (turn[j] === turn[i] && j < i)) isMax = false;
    }
    if (isMax) corners.push(i);
  }
  return corners;
}

function tangentAt(pts: Vec2[], i: number, dir: 1 | -1, span = 3): Vec2 {
  const n = pts.length, j = (i + dir * Math.min(span, n - 1) + n * 4) % n;
  return unit(sub(pts[j], pts[i]));
}

/** Fits a closed outline. `error` is the allowed distance in the outline's units. */
export function fitClosed(pts: Vec2[], error: number): PathNode[] {
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ p, in: p, out: p }));
  const corners = findCorners(pts);
  const beziers: Bez[] = [];
  const run = (from: number, to: number) => {
    // Points from `from` to `to` inclusive, wrapping.
    const seg: Vec2[] = [];
    for (let i = from; ; i = (i + 1) % n) { seg.push(pts[i]); if (i === to) break; }
    return seg;
  };
  if (corners.length === 0) {
    // Smooth loop: split at two far-apart points with shared (smooth) tangents.
    let far = 0, best = -1;
    for (let i = 0; i < n; i++) { const d = len(sub(pts[i], pts[0])); if (d > best) { best = d; far = i; } }
    const smooth = (i: number) => unit(sub(pts[(i + 1) % n], pts[(i - 1 + n) % n]));
    const t0 = smooth(0), tf = smooth(far);
    fitCubic(run(0, far), t0, mul(tf, -1), error, beziers);
    fitCubic(run(far, 0), tf, mul(t0, -1), error, beziers);
  } else {
    for (let c = 0; c < corners.length; c++) {
      const a = corners[c], b = corners[(c + 1) % corners.length];
      const seg = run(a, b === a ? (a - 1 + n) % n : b);
      if (seg.length < 2) continue;
      const t1 = tangentAt(seg, 0, 1), t2 = tangentAt(seg, seg.length - 1, -1);
      // tangentAt wraps over a closed list; for an open run use the run's own ends.
      const t1o = unit(sub(seg[Math.min(3, seg.length - 1)], seg[0]));
      const t2o = unit(sub(seg[Math.max(0, seg.length - 4)], seg[seg.length - 1]));
      fitCubic(seg, len(t1o) ? t1o : t1, len(t2o) ? t2o : t2, error, beziers);
    }
  }
  return beziers.map((b, i) => ({ p: b[0], out: b[1], in: beziers[(i - 1 + beziers.length) % beziers.length][2] }));
}
