import { describe, it, expect } from 'vitest';
import { parsePathData, arcToCubics, elementToSubpaths, type Subpath } from '../../../src/svg/geometry';
import type { Vec2 } from '../../../src/lottie/types';

const P = (sp: Subpath) => sp.verts.map((v) => v.p);

function bez(p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return [0, 1].map((k) => u ** 3 * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t ** 3 * p1[k]) as Vec2;
}

describe('parsePathData', () => {
  it('absolute and relative lines, H, V, Z', () => {
    const [a] = parsePathData('M10 10 L20 10 V20 H10 Z');
    expect(a.closed).toBe(true);
    expect(P(a)).toEqual([[10, 10], [20, 10], [20, 20], [10, 20]]);
    const [b] = parsePathData('m10 10 l10 0 v10 h-10 z');
    expect(P(b)).toEqual(P(a));
  });
  it('implicit lineto after moveto, and comma/compact syntax', () => {
    const [a] = parsePathData('M0,0 10,0-5-5');
    expect(P(a)).toEqual([[0, 0], [10, 0], [-5, -5]]);
  });
  it('cubic C and S reflect control points', () => {
    const [a] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    expect(a.verts[1].in).toEqual([10, 10]);
    expect(a.verts[1].out).toEqual([10, -10]);
    const [b] = parsePathData('m0 0 c0 10 10 10 10 0 s10 -10 10 0');
    expect(b.verts.map((v) => [v.p, v.in, v.out])).toEqual(a.verts.map((v) => [v.p, v.in, v.out]));
  });
  it('quadratic Q and T become cubic', () => {
    const [a] = parsePathData('M0 0 Q10 10 20 0 T40 0');
    expect(a.verts[0].out[0]).toBeCloseTo(20 / 3);
    expect(a.verts[0].out[1]).toBeCloseTo(20 / 3);
    expect(a.verts[1].out[1]).toBeCloseTo(-20 / 3);
  });
  it('merges a closing vertex that repeats the start', () => {
    const [a] = parsePathData('M0 0 C10 0 10 10 0 10 C-10 10 -10 0 0 0 Z');
    expect(a.verts).toHaveLength(2);
    expect(a.verts[0].in).toEqual([-10, 0]);
  });
  it('starts a new subpath after Z at the previous start', () => {
    const sps = parsePathData('M0 0 L10 0 L10 10 Z l5 5 l5 0');
    expect(sps).toHaveLength(2);
    expect(P(sps[1])[0]).toEqual([0, 0]);
    expect(P(sps[1])[1]).toEqual([5, 5]);
  });
  it('parses compact arc flags', () => {
    const [a] = parsePathData('M0 0a10 10 0 0110 10');
    expect(a.verts[a.verts.length - 1].p).toEqual([10, 10]);
  });
  it('throws on garbage', () => {
    expect(() => parsePathData('M0 0 L foo')).toThrow();
    expect(() => parsePathData('M0 0 Z 5 5')).toThrow();
  });
});

describe('arcToCubics', () => {
  // Endpoints (0,0)->(20,0), radius 20 (circle). The four flag combinations
  // pick between two centres (10, ±17.32) and short/long arcs.
  const r = 20, cy = Math.sqrt(r * r - 100);
  it.each([
    [false, false], [false, true], [true, false], [true, true],
  ])('large=%s sweep=%s stays on the circle', (large, sweep) => {
    const segs = arcToCubics([0, 0], r, r, 0, large, sweep, [20, 0]);
    expect(segs.length).toBeGreaterThan(0);
    const samples: Vec2[] = [];
    let p0: Vec2 = [0, 0];
    for (const [c1, c2, p1] of segs) {
      for (let t = 0; t <= 1; t += 0.1) samples.push(bez(p0, c1, c2, p1, t));
      p0 = p1;
    }
    const centres = [[10, cy], [10, -cy]];
    const fits = centres.filter((c) => samples.every((q) => Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - r) < 0.5));
    expect(fits).toHaveLength(1);
    const n = segs.length;
    expect(large ? n : 1).toBeGreaterThanOrEqual(large ? 3 : 1);
  });
  it('elliptical rotated arc lands exactly on the end point', () => {
    const segs = arcToCubics([0, 0], 30, 10, 30, false, true, [40, 20]);
    expect(segs[segs.length - 1][2]).toEqual([40, 20]);
  });
  it('scales up radii that are too small', () => {
    const segs = arcToCubics([0, 0], 1, 1, 0, false, true, [100, 0]);
    let p0: Vec2 = [0, 0];
    for (const [c1, c2, p1] of segs) {
      const q = bez(p0, c1, c2, p1, 0.5);
      expect(Math.abs(Math.hypot(q[0] - 50, q[1]) - 50)).toBeLessThan(0.5);
      p0 = p1;
    }
  });
});

describe('elementToSubpaths', () => {
  const el = (s: string) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${s}</svg>`, 'image/svg+xml').documentElement.firstElementChild!;
  it('rect', () => expect(P(elementToSubpaths(el('<rect x="1" y="2" width="10" height="5"/>'))![0])).toEqual([[1, 2], [11, 2], [11, 7], [1, 7]]));
  it('rounded rect has 8 vertices and clamps radius', () => {
    const [r] = elementToSubpaths(el('<rect width="10" height="10" rx="50"/>'))!;
    expect(r.verts).toHaveLength(8);
    expect(r.verts[0].p).toEqual([5, 0]);
  });
  it('circle and ellipse', () => {
    expect(P(elementToSubpaths(el('<circle cx="5" cy="5" r="5"/>'))![0])).toEqual([[10, 5], [5, 10], [0, 5], [5, 0]]);
    expect(P(elementToSubpaths(el('<ellipse cx="0" cy="0" rx="4" ry="2"/>'))![0])).toEqual([[4, 0], [0, 2], [-4, 0], [0, -2]]);
  });
  it('line, polyline, polygon', () => {
    const [l] = elementToSubpaths(el('<line x1="0" y1="0" x2="5" y2="5"/>'))!;
    expect(l.closed).toBe(false);
    expect(elementToSubpaths(el('<polyline points="0,0 1,1 2,0"/>'))![0].closed).toBe(false);
    expect(elementToSubpaths(el('<polygon points="0 0 1 1 2 0"/>'))![0].closed).toBe(true);
  });
  it('px units accepted, other units rejected', () => {
    expect(elementToSubpaths(el('<circle r="5px"/>'))).toHaveLength(1);
    expect(() => elementToSubpaths(el('<circle r="5mm"/>'))).toThrow();
  });
  it('non-geometry elements return null', () => expect(elementToSubpaths(el('<g/>'))).toBeNull());
});
