/** Editor document model (sheet editor spec §3). All coordinates are reference units. */
import { PART_IDS, type PartId } from '../sheet/layout';

export type Vec2 = [number, number];
export interface Paint { color: string; opacity: number }
export interface Style { fill: Paint | null; stroke: Paint | null; strokeWidth: number }

interface ShapeBase { id: string; rotation: number; style: Style }
export interface EllipseShape extends ShapeBase { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
export interface RectShape extends ShapeBase { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
/** Absolute, unrotated handle positions. */
export interface PathNode { p: Vec2; in: Vec2; out: Vec2 }
export interface PathShape extends ShapeBase { kind: 'path'; nodes: PathNode[]; closed: boolean }
export type EditorShape = EllipseShape | RectShape | PathShape;
/** A shape without its id, as passed to addShape. */
export type NewShape = EditorShape extends infer S ? (S extends EditorShape ? Omit<S, 'id'> : never) : never;

export interface ReferenceState { x: number; y: number; scale: number; opacity: number; locked: boolean; hasImage: boolean }
export interface EditorDoc {
  version: 1;
  name: string;
  nextId: number;
  parts: Record<PartId, EditorShape[]>;
  reference: ReferenceState;
}
export interface Box { x0: number; y0: number; x1: number; y1: number }

export const DEFAULT_STYLE: Style = { fill: { color: '#cccccc', opacity: 1 }, stroke: null, strokeWidth: 4 };

export function emptyDoc(name: string): EditorDoc {
  return {
    version: 1, name, nextId: 1,
    parts: Object.fromEntries(PART_IDS.map((p) => [p, []])) as unknown as Record<PartId, EditorShape[]>,
    reference: { x: 0, y: 0, scale: 1, opacity: 0.5, locked: false, hasImage: false },
  };
}

/** Unrotated bounding box (paths include their handles). */
export function bounds(s: EditorShape): Box {
  switch (s.kind) {
    case 'ellipse': return { x0: s.cx - s.rx, y0: s.cy - s.ry, x1: s.cx + s.rx, y1: s.cy + s.ry };
    case 'rect': return { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
    case 'path': {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of s.nodes) for (const q of [n.p, n.in, n.out]) {
        x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
      return { x0, y0, x1, y1 };
    }
  }
}

export function centre(s: EditorShape): Vec2 {
  const b = bounds(s);
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

export function rotatePoint(p: Vec2, about: Vec2, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = p[0] - about[0], dy = p[1] - about[1];
  return [about[0] + dx * c - dy * s, about[1] + dx * s + dy * c];
}

/** Unrotated (shape) frame → screen/sheet frame. */
export const toWorld = (s: EditorShape, p: Vec2): Vec2 => (s.rotation ? rotatePoint(p, centre(s), s.rotation) : p);
/** Sheet frame → the shape's unrotated frame. */
export const toLocal = (s: EditorShape, p: Vec2): Vec2 => (s.rotation ? rotatePoint(p, centre(s), -s.rotation) : p);

/** Rotated box corners: nw, ne, se, sw. */
export function orientedBox(s: EditorShape): [Vec2, Vec2, Vec2, Vec2] {
  const b = bounds(s);
  return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map((p) => toWorld(s, p as Vec2)) as [Vec2, Vec2, Vec2, Vec2];
}

export function normAngle(deg: number): number {
  let a = deg % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a === 0 ? 0 : a; // avoid -0
}

export function findShape(doc: EditorDoc, id: string): { part: PartId; index: number; shape: EditorShape } | null {
  for (const part of PART_IDS) {
    const index = doc.parts[part].findIndex((s) => s.id === id);
    if (index >= 0) return { part, index, shape: doc.parts[part][index] };
  }
  return null;
}

/** True when any part has at least one shape. */
export const hasShapes = (doc: EditorDoc) => PART_IDS.some((p) => doc.parts[p].length > 0);
