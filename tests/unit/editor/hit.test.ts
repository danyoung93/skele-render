import { describe, it, expect } from 'vitest';
import { boxTouches } from '../../../src/editor/hit';
import { DEFAULT_STYLE, type EditorShape } from '../../../src/editor/model';

const ellipse: EditorShape = { id: 'e', kind: 'ellipse', cx: 100, cy: 100, rx: 50, ry: 50, rotation: 0, style: DEFAULT_STYLE };
const bar: EditorShape = { id: 'r', kind: 'rect', x: 50, y: 90, w: 100, h: 20, r: 0, rotation: 45, style: DEFAULT_STYLE };
const line: EditorShape = { id: 'l', kind: 'path', closed: false, rotation: 0, style: DEFAULT_STYLE,
  nodes: [{ p: [0, 0], in: [0, 0], out: [0, 0] }, { p: [100, 0], in: [100, 0], out: [100, 0] }] };

describe('boxTouches', () => {
  it('ignores a box that only overlaps the empty corner of an ellipse\'s bounding box', () => {
    expect(boxTouches(ellipse, { x0: 140, y0: 140, x1: 160, y1: 160 })).toBe(false);
  });
  it('detects a box crossing the ellipse edge', () => {
    expect(boxTouches(ellipse, { x0: 140, y0: 90, x1: 160, y1: 110 })).toBe(true);
  });
  it('detects a box entirely inside a shape, and a box containing a shape', () => {
    expect(boxTouches(ellipse, { x0: 95, y0: 95, x1: 105, y1: 105 })).toBe(true);
    expect(boxTouches(ellipse, { x0: 0, y0: 0, x1: 300, y1: 300 })).toBe(true);
  });
  it('uses a rotated shape\'s real outline, not its bounding box', () => {
    expect(boxTouches(bar, { x0: 125, y0: 139, x1: 132, y1: 146 })).toBe(true);   // around a real corner
    expect(boxTouches(bar, { x0: 60, y0: 130, x1: 70, y1: 140 })).toBe(false);    // inside the bounding box only
  });
  it('treats open paths as lines', () => {
    expect(boxTouches(line, { x0: 40, y0: -5, x1: 60, y1: 5 })).toBe(true);
    expect(boxTouches(line, { x0: 40, y0: 5, x1: 60, y1: 15 })).toBe(false);
  });
});
