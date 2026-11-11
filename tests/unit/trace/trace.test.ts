import { describe, it, expect } from 'vitest';
import { traceAt, DEFAULT_SMOOTHNESS, DEFAULT_TOLERANCE } from '../../../src/trace/trace';
import { paint, circle, rect, roundRect, WHITE, RED } from './images';
import type { PathNode, Vec2 } from '../../../src/editor/model';

const all = (w: number, h: number) => ({ x0: 0, y0: 0, x1: w, y1: h });
/** Points along the closed path, `n` per segment. */
function samples(nodes: PathNode[], n = 40): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    for (let k = 0; k < n; k++) {
      const t = k / n, u = 1 - t;
      out.push([0, 1].map((d) => u ** 3 * a.p[d] + 3 * u * u * t * a.out[d] + 3 * u * t * t * b.in[d] + t ** 3 * b.p[d]) as Vec2);
    }
  }
  return out;
}
function ok(r: ReturnType<typeof traceAt>) {
  if ('error' in r) throw new Error(r.error);
  return r;
}
function inPolygon(p: Vec2, poly: Vec2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const opts = { tolerance: DEFAULT_TOLERANCE, smoothness: DEFAULT_SMOOTHNESS };

describe('traceAt accuracy', () => {
  it('circle r=40: every curve point within 0.75 px, at most 10 nodes', () => {
    const img = paint(120, 120, WHITE, [{ inside: circle(60, 60, 40), colour: RED }]);
    const r = ok(traceAt(img, [60, 60], { ...opts, limit: all(120, 120) }));
    expect(r.nodes.length).toBeLessThanOrEqual(10);
    const err = Math.max(...samples(r.nodes).map(([x, y]) => Math.abs(Math.hypot(x - 60, y - 60) - 40)));
    expect(err).toBeLessThan(0.75);
    expect(r.colour).toEqual([200, 40, 40]);
  });
  it('rounded rectangle: within 0.75 px of the true outline', () => {
    const img = paint(140, 100, WHITE, [{ inside: roundRect(20, 20, 120, 80, 12), colour: RED }]);
    const r = ok(traceAt(img, [70, 50], { ...opts, limit: all(140, 100) }));
    const sd = ([x, y]: Vec2) => {
      const qx = Math.abs(x - 70) - (50 - 12), qy = Math.abs(y - 50) - (30 - 12);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 12;
    };
    expect(Math.max(...samples(r.nodes).map((p) => Math.abs(sd(p))))).toBeLessThan(0.75);
    expect(r.nodes.length).toBeLessThanOrEqual(12);
  });
  it('square: keeps its 4 sharp corners', () => {
    const img = paint(120, 120, WHITE, [{ inside: rect(20, 20, 100, 100), colour: RED }]);
    const r = ok(traceAt(img, [60, 60], { ...opts, limit: all(120, 120) }));
    for (const c of [[20, 20], [100, 20], [100, 100], [20, 100]]) {
      expect(Math.min(...r.nodes.map((n) => Math.hypot(n.p[0] - c[0], n.p[1] - c[1]))), String(c)).toBeLessThan(1);
    }
  });
  it('concave L-shape: at least 98% overlap with the true shape', () => {
    const L = (x: number, y: number) => rect(20, 20, 60, 100)(x, y) || rect(20, 60, 100, 100)(x, y);
    const img = paint(120, 120, WHITE, [{ inside: L, colour: RED }]);
    const r = ok(traceAt(img, [30, 90], { ...opts, limit: all(120, 120) }));
    const poly = samples(r.nodes, 20);
    let inter = 0, union = 0;
    for (let y = 0; y < 120; y += 0.5) for (let x = 0; x < 120; x += 0.5) {
      const a = L(x, y), b = inPolygon([x, y], poly);
      if (a && b) inter++; if (a || b) union++;
    }
    expect(inter / union).toBeGreaterThanOrEqual(0.98);
  });
  it('ring: traces the filled outer circle', () => {
    const ring = (x: number, y: number) => circle(60, 60, 40)(x, y) && !circle(60, 60, 20)(x, y);
    const img = paint(120, 120, WHITE, [{ inside: ring, colour: RED }]);
    const r = ok(traceAt(img, [60, 30], { ...opts, limit: all(120, 120) }));
    expect(Math.max(...samples(r.nodes).map(([x, y]) => Math.abs(Math.hypot(x - 60, y - 60) - 40)))).toBeLessThan(0.75);
  });
});

describe('traceAt edge cases', () => {
  it('rejects a click outside the image and a speck', () => {
    const img = paint(60, 60, WHITE, [{ inside: rect(30, 30, 33, 33), colour: RED }]);
    expect(traceAt(img, [-1, 5], { ...opts, limit: all(60, 60) })).toEqual({ error: 'outside' });
    expect(traceAt(img, [31.5, 31.5], { ...opts, limit: all(60, 60) })).toEqual({ error: 'too-small' });
  });
  it('a thin 2-px line traces without throwing', () => {
    const img = paint(100, 60, WHITE, [{ inside: rect(10, 29, 90, 31), colour: RED }]);
    const r = ok(traceAt(img, [50, 30], { ...opts, limit: all(100, 60) }));
    expect(r.nodes.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(r.nodes)).not.toMatch(/null|NaN/);
  });
  it('traces a 512 × 512 area in under 150 ms', () => {
    const img = paint(520, 520, WHITE, [{ inside: circle(260, 260, 250), colour: RED }]);
    const t0 = performance.now();
    ok(traceAt(img, [260, 260], { ...opts, limit: all(520, 520) }));
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

describe('review fixes', () => {
  it('traces a 1-px line and a click on a square\'s corner pixel (#2)', () => {
    const line = paint(100, 40, WHITE, [{ inside: rect(10, 20, 90, 21), colour: RED }]);
    const r = traceAt(line, [50, 20], { ...opts, limit: all(100, 40) });
    expect('error' in r ? r.error : 'ok').toBe('ok');
    const sq = paint(60, 60, WHITE, [{ inside: rect(20, 20, 40, 40), colour: RED }]);
    const c = traceAt(sq, [20, 20], { ...opts, limit: all(60, 60) });
    expect('error' in c ? c.error : 'ok').toBe('ok');
  });
  it('traces a large area quickly: a 1536 × 1920 window in under 300 ms (#1)', () => {
    const big = paint(1536, 1920, WHITE, [{ inside: circle(768, 960, 700), colour: RED }]);
    traceAt(big, [768, 960], { ...opts, limit: all(1536, 1920) }); // warm up
    const t0 = performance.now();
    traceAt(big, [768, 960], { ...opts, limit: all(1536, 1920) });
    expect(performance.now() - t0).toBeLessThan(300);
  });
  it('returns the colour-matched mask (holes excluded) so a hover can be reused safely (#1)', () => {
    const ring = (x: number, y: number) => circle(60, 60, 40)(x, y) && !circle(60, 60, 20)(x, y);
    const rimg = paint(120, 120, WHITE, [{ inside: ring, colour: RED }]);
    const rr = ok(traceAt(rimg, [60, 30], { ...opts, limit: all(120, 120) }));
    expect(rr.mask[60 * 120 + 60]).toBe(1);
    expect(rr.coreMask[60 * 120 + 60]).toBe(0);
    expect(rr.coreMask[30 * 120 + 60]).toBe(1);
  });
  it('returns the area mask (#1)', () => {
    const img = paint(120, 120, WHITE, [{ inside: circle(60, 60, 40), colour: RED }]);
    const r = ok(traceAt(img, [60, 60], { ...opts, limit: all(120, 120) }));
    expect(r.mask[60 * 120 + 30]).toBe(1);
    expect(r.mask[5 * 120 + 5]).toBe(0);
  });
});
