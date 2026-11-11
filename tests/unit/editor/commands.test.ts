import { describe, it, expect } from 'vitest';
import { emptyDoc, DEFAULT_STYLE, toWorld, toLocal, centre, normAngle, findShape, orientedBox, type EditorDoc, type RectShape, type PathShape } from '../../../src/editor/model';
import { addShape, updateShape, deleteShapes, reorder, moveShapes, resizeShape, rotateShapes, setReference, partForPoint, resizeSelection } from '../../../src/editor/commands';

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
const close = (a: number[], b: number[], eps = 0.01) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(eps));
const rect = (o: Partial<RectShape> = {}) => ({ kind: 'rect' as const, x: 100, y: 100, w: 100, h: 50, r: 0, rotation: 0, style: DEFAULT_STYLE, ...o });
const path = (): Omit<PathShape, 'id'> => ({
  kind: 'path', closed: true, rotation: 0, style: DEFAULT_STYLE,
  nodes: [
    { p: [0, 0], in: [0, 0], out: [20, 0] },
    { p: [100, 0], in: [80, 0], out: [100, 20] },
    { p: [100, 100], in: [100, 80], out: [100, 100] },
  ],
});

describe('addShape', () => {
  it('assigns sequential ids and leaves the old document untouched', () => {
    const d0 = deepFreeze(emptyDoc('x'));
    const a = addShape(d0, 'head', rect());
    const b = addShape(a.doc, 'head', rect());
    expect([a.id, b.id]).toEqual(['s1', 's2']);
    expect(d0.parts.head).toEqual([]);
    expect(b.doc.parts.head.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('update, delete, move', () => {
  it('updates and deletes by id', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'torso', rect());
    const u = updateShape(deepFreeze(doc), id, { w: 10 });
    expect((findShape(u, id)!.shape as RectShape).w).toBe(10);
    expect(deleteShapes(u, [id]).parts.torso).toEqual([]);
  });
  it('moves ellipses, rects and paths (points and handles together)', () => {
    let d = emptyDoc('x');
    const e = addShape(d, 'head', { kind: 'ellipse', cx: 10, cy: 10, rx: 5, ry: 5, rotation: 0, style: DEFAULT_STYLE }); d = e.doc;
    const r = addShape(d, 'head', rect()); d = r.doc;
    const p = addShape(d, 'head', path()); d = p.doc;
    const m = moveShapes(deepFreeze(d), [e.id, r.id, p.id], 5, -5);
    expect(findShape(m, e.id)!.shape).toMatchObject({ cx: 15, cy: 5 });
    expect(findShape(m, r.id)!.shape).toMatchObject({ x: 105, y: 95 });
    expect((findShape(m, p.id)!.shape as PathShape).nodes[1]).toEqual({ p: [105, -5], in: [85, -5], out: [105, 15] });
  });
});

describe('reorder', () => {
  it('moves within the part and stays put at the ends', () => {
    let d = emptyDoc('x');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) { const r = addShape(d, 'head', rect()); d = r.doc; ids.push(r.id); }
    expect(reorder(d, ids[2], 'forward').parts.head.map((s) => s.id)).toEqual(ids);
    expect(reorder(d, ids[0], 'backward').parts.head.map((s) => s.id)).toEqual(ids);
    expect(reorder(d, ids[0], 'forward').parts.head.map((s) => s.id)).toEqual([ids[1], ids[0], ids[2]]);
  });
});

describe('rotation helpers', () => {
  it('normalises angles to (-180, 180]', () => {
    expect(normAngle(190)).toBe(-170);
    expect(normAngle(-180)).toBe(180);
    expect(normAngle(360)).toBe(0);
  });
  it('toWorld and toLocal invert each other', () => {
    const s = { ...rect({ rotation: 30 }), id: 'a' };
    close(toLocal(s, toWorld(s, [120, 110])), [120, 110], 1e-9);
    close(centre(s), [150, 125], 1e-9);
  });
  it('orientedBox starts at the top-left corner of the rotated box', () => {
    const s = { ...rect({ rotation: 90 }), id: 'a' };
    close(orientedBox(s)[0], toWorld(s, [100, 100]), 1e-9);
  });
});

describe('resizeShape', () => {
  it('keeps the opposite corner fixed on a rotated rect and keeps its rotation', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'torso', rect({ rotation: 30 }));
    const before = { ...findShape(doc, id)!.shape } as RectShape;
    const nwWorld = toWorld(before, [100, 100]);
    const target = toWorld(before, [260, 180]); // new local se corner
    const after = findShape(resizeShape(doc, id, 'se', target, false), id)!.shape as RectShape;
    expect(after.rotation).toBe(30);
    close(toWorld(after, [after.x, after.y]), nwWorld);
    close([after.w, after.h], [160, 80]);
  });
  it('scales path points and handles from the fixed corner', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'head', path());
    const after = findShape(resizeShape(doc, id, 'e', [200, 50], false), id)!.shape as PathShape;
    expect(after.nodes[1]).toEqual({ p: [200, 0], in: [160, 0], out: [200, 20] });
    expect(after.nodes[0].out).toEqual([40, 0]);
  });
  it('keeps proportions with keepRatio', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'head', rect());
    const after = findShape(resizeShape(doc, id, 'se', [400, 120], true), id)!.shape as RectShape;
    expect(after.w / after.h).toBeCloseTo(2);
  });
  it('resizeSelection maps unrotated shapes from one box to another', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'head', rect());
    const after = findShape(resizeSelection(doc, [id], { x0: 100, y0: 100, x1: 200, y1: 150 }, { x0: 0, y0: 0, x1: 200, y1: 100 }), id)!.shape as RectShape;
    expect(after).toMatchObject({ x: 0, y: 0, w: 200, h: 100 });
  });
});

describe('rotateShapes', () => {
  it('rotates centres about a point and adds the angle', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'head', { kind: 'ellipse', cx: 10, cy: 0, rx: 2, ry: 1, rotation: 100, style: DEFAULT_STYLE });
    const after = findShape(rotateShapes(doc, [id], 90, [0, 0]), id)!.shape;
    close(centre(after), [0, 10]);
    expect(after.rotation).toBe(-170);
  });
});

describe('reference and part assignment', () => {
  it('setReference patches reference state', () => {
    const d: EditorDoc = setReference(deepFreeze(emptyDoc('x')), { x: 5, locked: true });
    expect(d.reference).toMatchObject({ x: 5, locked: true, scale: 1 });
  });
  it('partForPoint picks the box under the point, else the active part', () => {
    expect(partForPoint([100, 100], 'torso')).toBe('head');
    expect(partForPoint([10, 1000], 'torso')).toBe('torso');
  });
});

describe('degenerate shapes (review #1)', () => {
  const line = (): Omit<PathShape, 'id'> => ({
    kind: 'path', closed: false, rotation: 0, style: DEFAULT_STYLE,
    nodes: [{ p: [420, 300], in: [420, 300], out: [420, 300] }, { p: [600, 300], in: [600, 300], out: [600, 300] }],
  });
  const finite = (s: unknown) => JSON.stringify(s).match(/null|NaN|Infinity/) === null;
  it('Shift-resizing a zero-height path keeps every number finite', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'head', line());
    const after = findShape(resizeShape(doc, id, 'se', [700, 340], true), id)!.shape as PathShape;
    expect(finite(after.nodes)).toBe(true);
    expect(after.nodes[1].p[0]).toBeCloseTo(700);
  });
  it('Shift-resizing a zero-width selection box keeps every number finite', async () => {
    const { dragBox } = await import('../../../src/editor/selection');
    const b = dragBox({ x0: 10, y0: 0, x1: 10, y1: 100 }, 'se', [40, 150], true);
    expect(Object.values(b).every(Number.isFinite)).toBe(true);
  });
});

import { duplicateShapes } from '../../../src/editor/commands';

describe('duplicateShapes', () => {
  it('copies each shape right after its original, offset, with new ids, rotation and style kept', () => {
    let d = emptyDoc('x');
    const a = addShape(d, 'head', rect({ rotation: 30 })); d = a.doc;
    const b = addShape(d, 'head', rect({ x: 0 })); d = b.doc;
    const c = addShape(d, 'torso', path()); d = c.doc;
    const frozen = deepFreeze(d);
    const r = duplicateShapes(frozen, [a.id, c.id], [10, 10]);
    expect(r.ids).toHaveLength(2);
    expect(r.ids.some((id) => [a.id, b.id, c.id].includes(id))).toBe(false);
    expect(r.doc.parts.head.map((s) => s.id)).toEqual([a.id, r.ids[0], b.id]);
    expect(r.doc.parts.torso.map((s) => s.id)).toEqual([c.id, r.ids[1]]);
    const copy = findShape(r.doc, r.ids[0])!.shape as RectShape;
    expect(copy).toMatchObject({ x: 110, y: 110, w: 100, h: 50, rotation: 30, style: DEFAULT_STYLE });
    expect((findShape(r.doc, r.ids[1])!.shape as PathShape).nodes[1].p).toEqual([110, 10]);
    expect(frozen.parts.head).toHaveLength(2);
  });
  it('ignores unknown ids', () => {
    const d = emptyDoc('x');
    expect(duplicateShapes(d, ['nope'], [10, 10])).toEqual({ doc: d, ids: [] });
  });
});
