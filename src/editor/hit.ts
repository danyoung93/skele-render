/** Does an axis-aligned box touch a shape's real (rotated, curved) outline? Used by area select. */
import { ellipse as ellipsePath, rect as rectPath, type Subpath } from '../svg/geometry';
import { toWorld, type Box, type EditorShape, type Vec2 } from './model';

const STEPS = 16;

/** The shape's outline as a polyline in sheet coordinates (closed shapes repeat no point). */
export function outline(s: EditorShape): { pts: Vec2[]; closed: boolean } {
  let sp: Subpath;
  if (s.kind === 'ellipse') sp = ellipsePath(s.cx, s.cy, s.rx, s.ry);
  else if (s.kind === 'rect') sp = rectPath(s.x, s.y, s.w, s.h, s.r, s.r);
  else sp = { closed: s.closed, verts: s.nodes.map((n) => ({ p: n.p, in: n.in, out: n.out })) };
  const v = sp.verts, segs = sp.closed ? v.length : v.length - 1;
  const pts: Vec2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    for (let k = 0; k < STEPS; k++) {
      const t = k / STEPS, u = 1 - t;
      pts.push([0, 1].map((d) => u ** 3 * a.p[d] + 3 * u * u * t * a.out[d] + 3 * u * t * t * b.in[d] + t ** 3 * b.p[d]) as Vec2);
    }
  }
  if (!sp.closed && v.length) pts.push(v[v.length - 1].p);
  return { pts: pts.map((p) => toWorld(s, p)), closed: sp.closed };
}

const inBox = (p: Vec2, b: Box) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;

function segmentsCross(p: Vec2, q: Vec2, r: Vec2, s: Vec2): boolean {
  const o = (a: Vec2, b: Vec2, c: Vec2) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p, q, r) !== o(p, q, s) && o(r, s, p) !== o(r, s, q);
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function boxTouches(s: EditorShape, b: Box): boolean {
  const { pts, closed } = outline(s);
  if (!pts.length) return false;
  if (pts.some((p) => inBox(p, b))) return true;
  const corners: Vec2[] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    for (let k = 0; k < 4; k++) if (segmentsCross(p, q, corners[k], corners[(k + 1) % 4])) return true;
  }
  // The whole box inside a filled shape.
  return closed && pointInPolygon(corners[0], pts);
}
