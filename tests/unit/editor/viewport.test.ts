import { describe, it, expect } from 'vitest';
import { screenToSheet, sheetToScreen, zoomAt, fitViewport, MIN_ZOOM, MAX_ZOOM } from '../../../src/editor/viewport';

describe('viewport', () => {
  it('screenToSheet reverses sheetToScreen', () => {
    for (const zoom of [0.5, 1, 3.7]) for (const [x, y] of [[200, 50], [-200, -50], [200, -50]]) {
      const v = { x, y, zoom };
      const s = screenToSheet(v, sheetToScreen(v, [123.4, 567.8]));
      expect(s[0]).toBeCloseTo(123.4, 9); expect(s[1]).toBeCloseTo(567.8, 9);
    }
  });
  it('zoomAt keeps the point under the pointer fixed', () => {
    const v = { x: 100, y: 40, zoom: 1.3 };
    const before = screenToSheet(v, [250, 130]);
    const after = screenToSheet(zoomAt(v, [250, 130], 1.7), [250, 130]);
    expect(Math.abs(after[0] - before[0])).toBeLessThan(1e-9);
    expect(Math.abs(after[1] - before[1])).toBeLessThan(1e-9);
  });
  it('clamps zoom to 25%–800%', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, [0, 0], 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, [0, 0], 0.001).zoom).toBe(MIN_ZOOM);
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.25, 8]);
  });
  it('fitViewport centres the sheet or a box with 24px padding', () => {
    const v = fitViewport(1072, 600);
    expect(v.zoom).toBeCloseTo((600 - 48) / 1024);
    const c = screenToSheet(v, [536, 300]);
    expect(c[0]).toBeCloseTo(512); expect(c[1]).toBeCloseTo(512);
    const b = fitViewport(400, 400, { x0: 32, y0: 32, x1: 352, y1: 352 });
    expect(b.zoom).toBeCloseTo(352 / 320);
    expect(screenToSheet(b, [24, 24])[0]).toBeCloseTo(32);
  });
});
