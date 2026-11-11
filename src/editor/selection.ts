/** Selection geometry shared by the view (drawing handles) and the select tool. */
import { keepRatioOnEdge, type Handle } from './commands';
import { bounds, findShape, orientedBox, toWorld, type Box, type EditorDoc, type EditorShape, type Vec2 } from './model';

export interface SelectionFrame {
  shapes: EditorShape[];
  /** Box corners nw, ne, se, sw on screen (rotated for a single shape). */
  corners: [Vec2, Vec2, Vec2, Vec2];
  centre: Vec2;
  /** Axis-aligned box (multi-selection), or the single shape's unrotated box. */
  box: Box;
  canResize: boolean;
  handles: { id: Handle; at: Vec2 }[];
  rotateAt: (px: number) => Vec2;
}

const HANDLE_LOCAL: Record<Handle, (b: Box) => Vec2> = {
  nw: (b) => [b.x0, b.y0], n: (b) => [(b.x0 + b.x1) / 2, b.y0], ne: (b) => [b.x1, b.y0], e: (b) => [b.x1, (b.y0 + b.y1) / 2],
  se: (b) => [b.x1, b.y1], s: (b) => [(b.x0 + b.x1) / 2, b.y1], sw: (b) => [b.x0, b.y1], w: (b) => [b.x0, (b.y0 + b.y1) / 2],
};

export function selectionFrame(doc: EditorDoc, ids: string[]): SelectionFrame | null {
  const shapes = ids.map((id) => findShape(doc, id)?.shape).filter((s): s is EditorShape => !!s);
  if (!shapes.length) return null;
  if (shapes.length === 1) {
    const s = shapes[0], b = bounds(s), corners = orientedBox(s);
    const centre: Vec2 = toWorld(s, [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]);
    const up = (px: number): Vec2 => toWorld(s, [(b.x0 + b.x1) / 2, b.y0 - 24 * px]);
    return {
      shapes, corners, centre, box: b, canResize: true, rotateAt: up,
      handles: (Object.keys(HANDLE_LOCAL) as Handle[]).map((id) => ({ id, at: toWorld(s, HANDLE_LOCAL[id](b)) })),
    };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) for (const p of orientedBox(s)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const box = { x0, y0, x1, y1 };
  const canResize = shapes.every((s) => s.rotation === 0);
  return {
    shapes, box, canResize, centre: [(x0 + x1) / 2, (y0 + y1) / 2],
    corners: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
    rotateAt: (px) => [(x0 + x1) / 2, y0 - 24 * px],
    handles: canResize ? (Object.keys(HANDLE_LOCAL) as Handle[]).map((id) => ({ id, at: HANDLE_LOCAL[id](box) })) : [],
  };
}

/** New axis-aligned box after dragging `handle` of `b` to `p`. */
export function dragBox(b: Box, handle: Handle, p: Vec2, keepRatio: boolean): Box {
  const nb = { ...b };
  if (handle.includes('e')) nb.x1 = Math.max(p[0], b.x0 + 1);
  if (handle.includes('w')) nb.x0 = Math.min(p[0], b.x1 - 1);
  if (handle.includes('s')) nb.y1 = Math.max(p[1], b.y0 + 1);
  if (handle.includes('n')) nb.y0 = Math.min(p[1], b.y1 - 1);
  if (keepRatio && handle.length === 2 && b.x1 > b.x0 && b.y1 > b.y0) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0, k = Math.max((nb.x1 - nb.x0) / w, (nb.y1 - nb.y0) / h);
    if (handle.includes('e')) nb.x1 = nb.x0 + w * k; else nb.x0 = nb.x1 - w * k;
    if (handle.includes('s')) nb.y1 = nb.y0 + h * k; else nb.y0 = nb.y1 - h * k;
  } else if (keepRatio && handle.length === 1 && b.x1 > b.x0 && b.y1 > b.y0) {
    keepRatioOnEdge(b, nb, handle);
  }
  return nb;
}
