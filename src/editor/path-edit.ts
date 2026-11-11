/** Pure path point editing (sheet editor spec §2.3, Edit points). Coordinates are the path's unrotated frame. */
import { centre, rotatePoint, type EditorShape, type PathNode, type PathShape, type Vec2 } from './model';

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const withNodes = (s: PathShape, nodes: PathNode[]): PathShape => ({ ...s, nodes });

export const segmentCount = (s: PathShape) => (s.closed ? s.nodes.length : s.nodes.length - 1);

function segment(s: PathShape, i: number): [Vec2, Vec2, Vec2, Vec2] {
  const a = s.nodes[i], b = s.nodes[(i + 1) % s.nodes.length];
  return [a.p, a.out, b.in, b.p];
}

export function segmentPoint(s: PathShape, i: number, t: number): Vec2 {
  const [p0, p1, p2, p3] = segment(s, i);
  const u = 1 - t;
  return [0, 1].map((k) => u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k]) as Vec2;
}

export function moveNode(s: PathShape, i: number, d: Vec2): PathShape {
  return withNodes(s, s.nodes.map((n, k) => (k === i ? { p: add(n.p, d), in: add(n.in, d), out: add(n.out, d) } : n)));
}

/** Moves one handle to `to`. Unless `independent`, the opposite handle points the other way, keeping its length. */
export function moveHandle(s: PathShape, i: number, which: 'in' | 'out', to: Vec2, independent: boolean): PathShape {
  return withNodes(s, s.nodes.map((n, k) => {
    if (k !== i) return n;
    const next = { ...n, [which]: to };
    if (independent) return next;
    const other = which === 'in' ? 'out' : 'in';
    const dir = sub(n.p, to), len = Math.hypot(...dir);
    const otherLen = Math.hypot(...sub(n[other], n.p));
    if (len < 1e-9 || otherLen < 1e-9) return next;
    return { ...next, [other]: add(n.p, [(dir[0] / len) * otherLen, (dir[1] / len) * otherLen]) };
  }));
}

/** Splits segment i at t, keeping the curve's shape. */
export function insertNode(s: PathShape, i: number, t: number): PathShape {
  const [p0, p1, p2, p3] = segment(s, i);
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t);
  const d = lerp(a, b, t), e = lerp(b, c, t), m = lerp(d, e, t);
  const nodes = s.nodes.map((n) => ({ ...n }));
  const j = (i + 1) % nodes.length;
  nodes[i].out = a;
  nodes[j].in = c;
  nodes.splice(i + 1, 0, { p: m, in: d, out: e });
  return withNodes(s, nodes);
}

export function removeNode(s: PathShape, i: number): PathShape | null {
  if (s.nodes.length <= 2) return null;
  return withNodes(s, s.nodes.filter((_, k) => k !== i));
}

export function nearestSegment(s: PathShape, p: Vec2): { segment: number; t: number; dist: number } {
  let best = { segment: 0, t: 0, dist: Infinity };
  for (let i = 0; i < segmentCount(s); i++) {
    for (let k = 0; k <= 50; k++) {
      const q = segmentPoint(s, i, k / 50), dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (dist < best.dist) best = { segment: i, t: k / 50, dist };
    }
  }
  // Refine around the best sample.
  for (let step = 1 / 100; step > 1e-4; step /= 2) {
    for (const t of [best.t - step, best.t + step]) {
      if (t < 0 || t > 1) continue;
      const q = segmentPoint(s, best.segment, t), dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (dist < best.dist) best = { ...best, t, dist };
    }
  }
  return best;
}

/**
 * After editing a rotated shape's geometry its centre (the rotation pivot) moves, which would shift the
 * whole shape on screen. Translate the edited geometry by (R − I)(c' − c) so the unrotated→screen
 * mapping is unchanged and untouched points stay put.
 */
export function keepFrame<S extends EditorShape>(before: S, after: S): S {
  if (!before.rotation) return after;
  const c = centre(before), c2 = centre(after);
  const d: Vec2 = [c2[0] - c[0], c2[1] - c[1]];
  const r = rotatePoint(d, [0, 0], before.rotation);
  return translate(after, r[0] - d[0], r[1] - d[1]);
}

function translate<S extends EditorShape>(s: S, dx: number, dy: number): S {
  const P = (p: Vec2): Vec2 => [p[0] + dx, p[1] + dy];
  switch (s.kind) {
    case 'ellipse': return { ...s, cx: s.cx + dx, cy: s.cy + dy };
    case 'rect': return { ...s, x: s.x + dx, y: s.y + dy };
    case 'path': return { ...s, nodes: s.nodes.map((n) => ({ p: P(n.p), in: P(n.in), out: P(n.out) })) };
  }
  return s;
}
