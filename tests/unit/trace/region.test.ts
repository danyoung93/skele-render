import { describe, it, expect } from 'vitest';
import { growRegion } from '../../../src/trace/region';
import { deltaE, rgbToLab } from '../../../src/trace/colour';
import { paint, circle, rect, WHITE, RED, type RGBA } from './images';

const all = (w: number, h: number) => ({ x0: 0, y0: 0, x1: w, y1: h });
const at = (m: Uint8Array, w: number, x: number, y: number) => m[y * w + x];

describe('colour', () => {
  it('ΔE is 0 for equal colours and about 100 between black and white', () => {
    expect(deltaE(rgbToLab(10, 20, 30), rgbToLab(10, 20, 30))).toBe(0);
    expect(deltaE(rgbToLab(0, 0, 0), rgbToLab(255, 255, 255))).toBeCloseTo(100, 0);
  });
});

describe('growRegion', () => {
  it('picks the connected area and its exact median colour, ignoring antialiased edges', () => {
    const img = paint(100, 100, WHITE, [{ inside: circle(50, 50, 30), colour: RED }]);
    const r = growRegion(img, [50, 50], 12, all(100, 100));
    expect(r.colour).toEqual([200, 40, 40]);
    const area = Math.PI * 30 * 30;
    expect(r.count).toBeGreaterThan(area * 0.95);
    expect(r.count).toBeLessThan(area * 1.15);
    expect(at(r.mask, 100, 5, 5)).toBe(0);
    expect(r.hitLimit).toBe(false);
  });
  it('separates colours about 8 ΔE apart at tolerance 5 and merges them at 12', () => {
    const a: RGBA = [120, 120, 200, 255], b: RGBA = [140, 140, 225, 255]; // ΔE ≈ 8.0
    expect(deltaE(rgbToLab(a[0], a[1], a[2]), rgbToLab(b[0], b[1], b[2]))).toBeGreaterThan(6);
    expect(deltaE(rgbToLab(a[0], a[1], a[2]), rgbToLab(b[0], b[1], b[2]))).toBeLessThan(10);
    const img = paint(80, 40, WHITE, [{ inside: rect(0, 0, 40, 40), colour: a }, { inside: rect(40, 0, 80, 40), colour: b }]);
    const strict = growRegion(img, [10, 20], 5, all(80, 40));
    expect(at(strict.mask, 80, 70, 20)).toBe(0);
    const loose = growRegion(img, [10, 20], 12, all(80, 40));
    expect(at(loose.mask, 80, 70, 20)).toBe(1);
  });
  it('fills holes and grows the edge by one pixel', () => {
    const img = paint(100, 100, WHITE, [{ inside: circle(50, 50, 30), colour: RED }, { inside: circle(50, 50, 10), colour: WHITE }]);
    const r = growRegion(img, [50, 25], 12, all(100, 100));
    expect(at(r.mask, 100, 50, 50)).toBe(1);
    // x = 19 is just outside the 30-px radius (its pixel centre is 30.5 from the centre): included by the 1-px grow.
    expect(at(r.mask, 100, 19, 50)).toBe(1);
    expect(at(r.mask, 100, 17, 50)).toBe(0);
  });
  it('does not leak through a diagonal one-pixel gap', () => {
    // Two squares touching only at one corner.
    const img = paint(40, 40, WHITE, [{ inside: rect(0, 0, 20, 20), colour: RED }, { inside: rect(20, 20, 40, 40), colour: RED }]);
    const r = growRegion(img, [5, 5], 12, all(40, 40));
    // The 1-px grow may touch the other square's corner pixel, but must not spread into it.
    expect(at(r.mask, 40, 35, 35)).toBe(0);
  });
  it('reports hitting the limit, but not the image border', () => {
    const img = paint(100, 100, WHITE, [{ inside: circle(50, 50, 20), colour: RED }]);
    expect(growRegion(img, [5, 5], 12, { x0: 0, y0: 0, x1: 80, y1: 100 }).hitLimit).toBe(true);
    expect(growRegion(img, [5, 5], 12, all(100, 100)).hitLimit).toBe(false);
  });
  it('counts fully transparent pixels as white', () => {
    const img = paint(60, 60, [0, 0, 0, 0], [{ inside: circle(30, 30, 15), colour: RED }]);
    const r = growRegion(img, [2, 2], 12, all(60, 60));
    expect(r.colour).toEqual([255, 255, 255]);
    expect(at(r.mask, 60, 30, 30)).toBe(1); // the red circle is a hole in the background → filled
  });
});
