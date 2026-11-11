/** Editing commands (sheet editor spec §4). Each returns a new document. */
import { AREAS, PART_IDS, type PartId } from '../sheet/layout';
import { keepFrame } from './path-edit';
import {
  bounds, centre, findShape, normAngle, orientedBox, rotatePoint, tightBounds, toWorld,
  type Box, type EditorDoc, type EditorShape, type NewShape, type ReferenceState, type Vec2,
} from './model';

export type { Box };
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const MIN_SIZE = 1;

function mapShapes(doc: EditorDoc, ids: Set<string>, fn: (s: EditorShape) => EditorShape): EditorDoc {
  let changed = false;
  const parts = { ...doc.parts };
  for (const p of PART_IDS) {
    if (!doc.parts[p].some((s) => ids.has(s.id))) continue;
    parts[p] = doc.parts[p].map((s) => (ids.has(s.id) ? fn(s) : s));
    changed = true;
  }
  return changed ? { ...doc, parts } : doc;
}

export function addShape(doc: EditorDoc, part: PartId, shape: NewShape): { doc: EditorDoc; id: string } {
  const id = `s${doc.nextId}`;
  const s = { ...shape, id } as EditorShape;
  return { id, doc: { ...doc, nextId: doc.nextId + 1, parts: { ...doc.parts, [part]: [...doc.parts[part], s] } } };
}

export function updateShape(doc: EditorDoc, id: string, patch: Partial<EditorShape>): EditorDoc {
  return mapShapes(doc, new Set([id]), (s) => ({ ...s, ...patch, id: s.id, kind: s.kind }) as EditorShape);
}

export function deleteShapes(doc: EditorDoc, ids: string[]): EditorDoc {
  const set = new Set(ids);
  const parts = { ...doc.parts };
  for (const p of PART_IDS) if (doc.parts[p].some((s) => set.has(s.id))) parts[p] = doc.parts[p].filter((s) => !set.has(s.id));
  return { ...doc, parts };
}

export function reorder(doc: EditorDoc, id: string, dir: 'forward' | 'backward'): EditorDoc {
  const f = findShape(doc, id);
  if (!f) return doc;
  const list = doc.parts[f.part];
  const to = dir === 'forward' ? f.index + 1 : f.index - 1;
  if (to < 0 || to >= list.length) return doc;
  const next = [...list];
  [next[f.index], next[to]] = [next[to], next[f.index]];
  return { ...doc, parts: { ...doc.parts, [f.part]: next } };
}

/** Applies an affine map x' = a*x + b, y' = c*y + d to unrotated geometry. */
function mapGeometry(s: EditorShape, sx: number, tx: number, sy: number, ty: number): EditorShape {
  const P = (p: Vec2): Vec2 => [p[0] * sx + tx, p[1] * sy + ty];
  switch (s.kind) {
    case 'ellipse': return { ...s, cx: s.cx * sx + tx, cy: s.cy * sy + ty, rx: s.rx * Math.abs(sx), ry: s.ry * Math.abs(sy) };
    case 'rect': return { ...s, x: s.x * sx + tx, y: s.y * sy + ty, w: s.w * sx, h: s.h * sy };
    case 'path': return { ...s, nodes: s.nodes.map((n) => ({ p: P(n.p), in: P(n.in), out: P(n.out) })) };
  }
}

const translateShape = (s: EditorShape, dx: number, dy: number) => mapGeometry(s, 1, dx, 1, dy);

/** Copies shapes (each right above its original, in the same part), offset by `offset`. */
export function duplicateShapes(doc: EditorDoc, ids: string[], offset: Vec2): { doc: EditorDoc; ids: string[] } {
  const set = new Set(ids);
  let nextId = doc.nextId;
  const copies = new Map<string, string>();
  const parts = { ...doc.parts };
  for (const p of PART_IDS) {
    if (!doc.parts[p].some((s) => set.has(s.id))) continue;
    parts[p] = doc.parts[p].flatMap((s) => {
      if (!set.has(s.id)) return [s];
      const copy = { ...translateShape(s, offset[0], offset[1]), id: `s${nextId++}` };
      copies.set(s.id, copy.id);
      return [s, copy];
    });
  }
  if (!copies.size) return { doc, ids: [] };
  return { doc: { ...doc, nextId, parts }, ids: ids.filter((id) => copies.has(id)).map((id) => copies.get(id)!) };
}

/**
 * Mirrors shapes horizontally ('h') or vertically ('v'): one shape across its own centre, several across
 * the centre of the selection. Geometry is mirrored in each shape's own frame and its rotation reversed,
 * which is exactly a mirror image on screen (M·R(θ) = R(−θ)·M).
 */
export function flipShapes(doc: EditorDoc, ids: string[], axis: 'h' | 'v'): EditorDoc {
  const shapes = ids.map((id) => findShape(doc, id)?.shape).filter((s): s is EditorShape => !!s);
  if (!shapes.length) return doc;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) for (const p of orientedBox(s)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const about: Vec2 = shapes.length === 1 ? centre(shapes[0]) : [(x0 + x1) / 2, (y0 + y1) / 2];
  return mapShapes(doc, new Set(ids), (s) => {
    const c = centre(s);
    // Mirror the geometry across its own centre (this keeps the centre where it is)...
    const mirrored = axis === 'h' ? mapGeometry(s, -1, 2 * c[0], 1, 0) : mapGeometry(s, 1, 0, -1, 2 * c[1]);
    const fixed = s.kind === 'rect' ? normaliseRect(mirrored as Extract<EditorShape, { kind: 'rect' }>) : mirrored;
    // ...then move the centre to its mirror image across `about`.
    const nc: Vec2 = axis === 'h' ? [2 * about[0] - c[0], c[1]] : [c[0], 2 * about[1] - c[1]];
    return { ...translateShape(fixed, nc[0] - c[0], nc[1] - c[1]), rotation: normAngle(-s.rotation) };
  });
}

/** Mirroring gives a rect negative width/height; express it as the same box with positive size. */
function normaliseRect<S extends Extract<EditorShape, { kind: 'rect' }>>(r: S): S {
  return { ...r, x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
}

export function moveShapes(doc: EditorDoc, ids: string[], dx: number, dy: number): EditorDoc {
  return mapShapes(doc, new Set(ids), (s) => translateShape(s, dx, dy));
}

/** Maps the shape's unrotated box `from` onto `to` (both in its local frame). */
function boxMap(s: EditorShape, from: Box, to: Box): EditorShape {
  const sx = (to.x1 - to.x0) / (from.x1 - from.x0 || 1);
  const sy = (to.y1 - to.y0) / (from.y1 - from.y0 || 1);
  return mapGeometry(s, sx, to.x0 - from.x0 * sx, sy, to.y0 - from.y0 * sy);
}

export function resizeShape(doc: EditorDoc, id: string, handle: Handle, point: Vec2, keepRatio: boolean): EditorDoc {
  return mapShapes(doc, new Set([id]), (s) => {
    const b = bounds(s);
    const c = centre(s);
    const local = s.rotation ? rotatePoint(point, c, -s.rotation) : point;
    const nb: Box = { ...b };
    if (handle.includes('e')) nb.x1 = Math.max(local[0], b.x0 + MIN_SIZE);
    if (handle.includes('w')) nb.x0 = Math.min(local[0], b.x1 - MIN_SIZE);
    if (handle.includes('s')) nb.y1 = Math.max(local[1], b.y0 + MIN_SIZE);
    if (handle.includes('n')) nb.y0 = Math.min(local[1], b.y1 - MIN_SIZE);
    const w0 = b.x1 - b.x0, h0 = b.y1 - b.y0;
    // Keeping proportions is meaningless for a zero-width or zero-height shape (k would be infinite).
    if (keepRatio && handle.length === 2 && w0 > 0 && h0 > 0) {
      const w = w0, h = h0;
      const k = Math.max((nb.x1 - nb.x0) / w, (nb.y1 - nb.y0) / h);
      if (handle.includes('e')) nb.x1 = nb.x0 + w * k; else nb.x0 = nb.x1 - w * k;
      if (handle.includes('s')) nb.y1 = nb.y0 + h * k; else nb.y0 = nb.y1 - h * k;
    } else if (keepRatio && handle.length === 1 && w0 > 0 && h0 > 0) {
      keepRatioOnEdge(b, nb, handle);
    }
    let out = boxMap(s, b, nb);
    if (s.rotation) {
      // Keep the fixed side where it was on screen: the new centre in the old frame, mapped to world.
      const lc: Vec2 = [(nb.x0 + nb.x1) / 2, (nb.y0 + nb.y1) / 2];
      const wc = toWorld(s, lc);
      out = translateShape(out, wc[0] - lc[0], wc[1] - lc[1]);
    }
    return out;
  });
}

/** Shift on an edge handle: scale the other axis by the same factor, about its centre. */
export function keepRatioOnEdge(b: Box, nb: Box, handle: Handle): void {
  if (handle === 'e' || handle === 'w') {
    const k = (nb.x1 - nb.x0) / (b.x1 - b.x0), cy = (b.y0 + b.y1) / 2, h = (b.y1 - b.y0) * k;
    nb.y0 = cy - h / 2; nb.y1 = cy + h / 2;
  } else {
    const k = (nb.y1 - nb.y0) / (b.y1 - b.y0), cx = (b.x0 + b.x1) / 2, w = (b.x1 - b.x0) * k;
    nb.x0 = cx - w / 2; nb.x1 = cx + w / 2;
  }
}

/**
 * Sets the visible width and/or height (sheet editor W/H fields), keeping the top-left of the outline
 * fixed on screen. A multi-selection is resized as one box, and only when nothing in it is rotated.
 */
export function setSize(doc: EditorDoc, ids: string[], size: { w?: number; h?: number }, keepRatio: boolean): EditorDoc {
  const shapes = ids.map((id) => findShape(doc, id)?.shape).filter((s): s is EditorShape => !!s);
  if (!shapes.length) return doc;
  if (shapes.length > 1 && shapes.some((s) => s.rotation !== 0)) return doc;
  const tb = shapes.map(tightBounds).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  const w = tb.x1 - tb.x0, h = tb.y1 - tb.y0;
  const MIN = 1;
  let fx = size.w !== undefined && w > 0 ? Math.max(MIN, size.w) / w : 1;
  let fy = size.h !== undefined && h > 0 ? Math.max(MIN, size.h) / h : 1;
  if (keepRatio) { if (size.w !== undefined && w > 0) fy = fx; else if (size.h !== undefined && h > 0) fx = fy; }
  const scale = (s: EditorShape) => mapGeometry(s, fx, tb.x0 - tb.x0 * fx, fy, tb.y0 - tb.y0 * fy);
  return mapShapes(doc, new Set(ids), (s) => (s.rotation ? keepFrame(s, scale(s)) : scale(s)));
}

/** Resizes unrotated shapes from one selection box to another. */
export function resizeSelection(doc: EditorDoc, ids: string[], from: Box, to: Box): EditorDoc {
  return mapShapes(doc, new Set(ids), (s) => boxMap(s, from, to));
}

export function rotateShapes(doc: EditorDoc, ids: string[], angle: number, about: Vec2): EditorDoc {
  return mapShapes(doc, new Set(ids), (s) => {
    const c = centre(s);
    const nc = rotatePoint(c, about, angle);
    return { ...translateShape(s, nc[0] - c[0], nc[1] - c[1]), rotation: normAngle(s.rotation + angle) };
  });
}

export function setReference(doc: EditorDoc, patch: Partial<ReferenceState>): EditorDoc {
  return { ...doc, reference: { ...doc.reference, ...patch } };
}

export function partForPoint(p: Vec2, active: PartId): PartId {
  for (const id of PART_IDS) {
    const a = AREAS[id];
    if (p[0] >= a.x && p[0] <= a.x + a.w && p[1] >= a.y && p[1] <= a.y + a.h) return id;
  }
  return active;
}
