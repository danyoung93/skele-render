import { describe, it, expect } from 'vitest';
import { emptyDoc, DEFAULT_STYLE, toWorld, toLocal, centre, bounds, normAngle, findShape, orientedBox, type EditorDoc, type RectShape, type PathShape } from '../../../src/editor/model';
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

import { setSize } from '../../../src/editor/commands';
import { tightBounds } from '../../../src/editor/model';

describe('tightBounds', () => {
  it('measures a curved path by its outline, not its handles', () => {
    const p = { ...path(), id: 'p', closed: false, nodes: [{ p: [0, 0], in: [0, 0], out: [0, -50] }, { p: [100, 0], in: [100, -50], out: [100, 0] }] } as PathShape;
    const b = tightBounds(p);
    expect(b.y0).toBeCloseTo(-37.5, 3);
    expect([b.x0, b.x1, b.y1]).toEqual([0, 100, 0]);
  });
  it('equals bounds for ellipses and rects', () => {
    expect(tightBounds({ ...rect(), id: 'r' })).toEqual({ x0: 100, y0: 100, x1: 200, y1: 150 });
  });
});

describe('setSize', () => {
  it('sets width keeping the top-left corner on screen and the rotation, even when rotated', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'torso', rect({ rotation: 30 }));
    const before = findShape(doc, id)!.shape;
    const nw = toWorld(before, [100, 100]);
    const after = findShape(setSize(doc, [id], { w: 200 }, false), id)!.shape as RectShape;
    expect([after.w, after.h, after.rotation]).toEqual([200, 50, 30]);
    close(toWorld(after, [after.x, after.y]), nw);
  });
  it('keeps proportions when asked', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'torso', rect());
    expect(findShape(setSize(doc, [id], { h: 100 }, true), id)!.shape).toMatchObject({ w: 200, h: 100, x: 100, y: 100 });
  });
  it('scales a curved path so its outline gets the requested size', () => {
    const p = { ...path(), closed: false, nodes: [{ p: [0, 0], in: [0, 0], out: [0, -50] }, { p: [100, 0], in: [100, -50], out: [100, 0] }] } as Omit<PathShape, 'id'>;
    const { doc, id } = addShape(emptyDoc('x'), 'head', p);
    const after = findShape(setSize(doc, [id], { h: 75 }, false), id)!.shape;
    const b = tightBounds(after);
    expect(b.y1 - b.y0).toBeCloseTo(75, 3);
    expect(b.y0).toBeCloseTo(-37.5, 3);
  });
  it('resizes an unrotated multi-selection as one box, and leaves a rotated one alone', () => {
    let d = emptyDoc('x');
    const a = addShape(d, 'head', rect({ x: 0, y: 0, w: 50, h: 50 })); d = a.doc;
    const b = addShape(d, 'head', rect({ x: 50, y: 0, w: 50, h: 50 })); d = b.doc;
    const r = setSize(d, [a.id, b.id], { w: 200 }, false);
    expect(findShape(r, b.id)!.shape).toMatchObject({ x: 100, w: 100, h: 50 });
    const rotated = updateShape(d, a.id, { rotation: 10 });
    expect(setSize(rotated, [a.id, b.id], { w: 200 }, false)).toBe(rotated);
  });
  it('a zero-height line keeps its height instead of producing NaN', () => {
    const line = { ...path(), closed: false, nodes: [{ p: [0, 0], in: [0, 0], out: [0, 0] }, { p: [100, 0], in: [100, 0], out: [100, 0] }] } as Omit<PathShape, 'id'>;
    const { doc, id } = addShape(emptyDoc('x'), 'head', line);
    const after = findShape(setSize(doc, [id], { w: 50 }, true), id)!.shape as PathShape;
    expect(after.nodes[1].p).toEqual([50, 0]);
  });
});

describe('Shift on edge handles keeps proportions', () => {
  it('resizeShape: dragging the east edge scales height about the vertical centre', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'torso', rect());
    expect(findShape(resizeShape(doc, id, 'e', [300, 125], true), id)!.shape).toMatchObject({ x: 100, w: 200, h: 100, y: 75 });
  });
  it('dragBox: dragging the south edge scales width about the horizontal centre', async () => {
    const { dragBox } = await import('../../../src/editor/selection');
    expect(dragBox({ x0: 0, y0: 0, x1: 100, y1: 50 }, 's', [50, 100], true)).toEqual({ x0: -50, y0: 0, x1: 150, y1: 100 });
  });
});

import { flipShapes } from '../../../src/editor/commands';

describe('flipShapes', () => {
  const curve = (): Omit<PathShape, 'id'> => ({ ...path(), closed: false, nodes: [
    { p: [0, 0], in: [0, 0], out: [30, -40] },
    { p: [100, 20], in: [80, -30], out: [100, 20] },
  ] });
  it('mirrors one path across its own centre; flipping twice restores it', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'head', curve());
    const once = findShape(flipShapes(doc, [id], 'h'), id)!.shape as PathShape;
    const c = centre(findShape(doc, id)!.shape);
    expect(centre(once)[0]).toBeCloseTo(c[0]); expect(centre(once)[1]).toBeCloseTo(c[1]);
    const b = bounds(findShape(doc, id)!.shape);
    expect(once.nodes[0].p[0]).toBeCloseTo(b.x0 + b.x1 - 0);
    expect(once.nodes[0].p[1]).toBe(0);
    const twice = findShape(flipShapes(flipShapes(doc, [id], 'h'), [id], 'h'), id)!.shape as PathShape;
    twice.nodes.forEach((n, i) => close([...n.p, ...n.in, ...n.out], [...(findShape(doc, id)!.shape as PathShape).nodes[i].p, ...(findShape(doc, id)!.shape as PathShape).nodes[i].in, ...(findShape(doc, id)!.shape as PathShape).nodes[i].out], 1e-9));
  });
  it('reverses rotation and mirrors the shape on screen', () => {
    const { doc, id } = addShape(emptyDoc('x'), 'torso', rect({ rotation: 20 }));
    const before = findShape(doc, id)!.shape;
    const after = findShape(flipShapes(doc, [id], 'v'), id)!.shape as RectShape;
    expect(after.rotation).toBe(-20);
    // Each corner's mirror image (across the horizontal line through the centre) is a corner of the result.
    const c = centre(before);
    const mirrored = orientedBox(before).map(([x, y]) => [x, 2 * c[1] - y]);
    const got = orientedBox(after);
    for (const m of mirrored) expect(got.some((g) => Math.hypot(g[0] - m[0], g[1] - m[1]) < 1e-6)).toBe(true);
  });
  it('flips a group across the selection centre, so shapes swap sides', () => {
    let d = emptyDoc('x');
    const a = addShape(d, 'head', rect({ x: 0, y: 0, w: 20, h: 10 })); d = a.doc;
    const b = addShape(d, 'head', rect({ x: 80, y: 30, w: 20, h: 10 })); d = b.doc;
    const r = flipShapes(d, [a.id, b.id], 'h');
    expect(findShape(r, a.id)!.shape).toMatchObject({ x: 80, y: 0 });
    expect(findShape(r, b.id)!.shape).toMatchObject({ x: 0, y: 30 });
  });
});
