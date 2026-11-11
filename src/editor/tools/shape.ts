/** Ellipse and rectangle tools (sheet editor spec §2.3). */
import { addShape, partForPoint } from '../commands';
import type { NewShape, Vec2 } from '../model';
import { shapeSvg } from '../serialize';
import type { Tool } from './types';

const MIN = 2;

export function createShapeTool(kind: 'ellipse' | 'rect'): Tool {
  let start: Vec2 | null = null;
  let current: NewShape | null = null;

  function build(a: Vec2, b: Vec2, square: boolean, fromCentre: boolean, style: NewShape['style']): NewShape {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    if (square) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
    let x0: number, y0: number, x1: number, y1: number;
    if (fromCentre) { x0 = a[0] - dx; y0 = a[1] - dy; x1 = a[0] + dx; y1 = a[1] + dy; }
    else { x0 = a[0]; y0 = a[1]; x1 = a[0] + dx; y1 = a[1] + dy; }
    const X0 = Math.min(x0, x1), Y0 = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
    return kind === 'ellipse'
      ? { kind, cx: X0 + W / 2, cy: Y0 + H / 2, rx: W / 2, ry: H / 2, rotation: 0, style }
      : { kind, x: X0, y: Y0, w: W, h: H, r: 0, rotation: 0, style };
  }
  const size = (s: NewShape) => (s.kind === 'ellipse' ? [s.rx * 2, s.ry * 2] : s.kind === 'rect' ? [s.w, s.h] : [0, 0]);

  return {
    id: kind,
    cursor: 'crosshair',
    down(e, ctx) {
      start = ctx.toSheet(e);
      const part = partForPoint(start, ctx.store.get().active);
      if (part !== ctx.store.get().active) ctx.store.setActive(part);
    },
    move(e, ctx) {
      if (!start) return;
      current = build(start, ctx.toSheet(e), e.shiftKey, e.altKey, ctx.store.get().style);
      ctx.layer.innerHTML = shapeSvg({ ...current, id: 'preview' } as never, ' class="preview" pointer-events="none"');
    },
    up(_e, ctx) {
      const s = current;
      start = null; current = null; ctx.layer.innerHTML = '';
      if (!s) return;
      const [w, h] = size(s);
      if (w < MIN || h < MIN) return;
      const { doc, id } = addShape(ctx.store.doc(), ctx.store.get().active, s);
      ctx.store.commit(doc);
      ctx.store.select([id]);
    },
    cancel(ctx) {
      if (!start) return false;
      start = null; current = null; ctx.layer.innerHTML = '';
      return true;
    },
  };
}
