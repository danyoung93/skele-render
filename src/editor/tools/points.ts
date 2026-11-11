/** Edit points: drag points and handles, insert by double-click, delete (sheet editor spec §2.3). */
import { deleteShapes, updateShape } from '../commands';
import { findShape, toLocal, toWorld, type EditorDoc, type PathShape, type Vec2 } from '../model';
import { insertNode, keepFrame, moveHandle, moveNode, nearestSegment, removeNode } from '../path-edit';
import type { Tool, ToolCtx } from './types';

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const INSERT_RADIUS_PX = 10;

type Drag =
  | { kind: 'node'; i: number; start: Vec2; base: EditorDoc; shape: PathShape }
  | { kind: 'handle'; i: number; which: 'in' | 'out'; base: EditorDoc; shape: PathShape };

export function createPointsTool(): Tool {
  let selectedNode: number | null = null;
  let drag: Drag | null = null;

  const selectedPath = (ctx: ToolCtx): PathShape | null => {
    const sel = ctx.store.get().selection;
    if (sel.length !== 1) return null;
    const s = findShape(ctx.store.doc(), sel[0])?.shape;
    return s && s.kind === 'path' ? s : null;
  };
  const apply = (_ctx: ToolCtx, base: EditorDoc, before: PathShape, after: PathShape) =>
    updateShape(base, before.id, { nodes: keepFrame(before, after).nodes });

  function draw(ctx: ToolCtx) {
    const s = selectedPath(ctx);
    if (!s) { ctx.layer.innerHTML = ''; return; }
    const px = ctx.px(), W = (p: Vec2) => toWorld(s, p);
    const parts: string[] = [];
    s.nodes.forEach((nd, i) => {
      const p = W(nd.p);
      for (const which of ['in', 'out'] as const) {
        const h = W(nd[which]);
        if (Math.hypot(h[0] - p[0], h[1] - p[1]) < 1e-6) continue;
        parts.push(`<line class="ctrl-line" pointer-events="none" x1="${n(p[0])}" y1="${n(p[1])}" x2="${n(h[0])}" y2="${n(h[1])}" stroke-width="${n(px)}"/>`,
          `<circle class="ctrl" data-ctrl="${i}:${which}" cx="${n(h[0])}" cy="${n(h[1])}" r="${n(3.5 * px)}"/>`);
      }
    });
    s.nodes.forEach((nd, i) => {
      const p = W(nd.p), r = 4.5 * px;
      parts.push(`<rect class="node${i === selectedNode ? ' sel' : ''}" data-node="${i}" x="${n(p[0] - r)}" y="${n(p[1] - r)}" width="${n(2 * r)}" height="${n(2 * r)}" stroke-width="${n(px)}"/>`);
    });
    ctx.layer.innerHTML = parts.join('');
  }

  return {
    id: 'points',
    cursor: 'default',
    down(e, ctx) {
      const t = ctx.target(e), s = selectedPath(ctx), doc = ctx.store.doc();
      const nodeAttr = t?.getAttribute('data-node'), ctrlAttr = t?.getAttribute('data-ctrl');
      if (s && nodeAttr !== null && nodeAttr !== undefined) {
        selectedNode = Number(nodeAttr);
        drag = { kind: 'node', i: selectedNode, start: toLocal(s, ctx.toSheet(e)), base: doc, shape: s };
        draw(ctx);
        return;
      }
      if (s && ctrlAttr) {
        const [i, which] = ctrlAttr.split(':');
        drag = { kind: 'handle', i: Number(i), which: which as 'in' | 'out', base: doc, shape: s };
        return;
      }
      // Pressing on (or just outside) the selected path's outline keeps it selected, so a
      // double-click on the edge can insert a point.
      if (s && nearestSegment(s, toLocal(s, ctx.toSheet(e))).dist <= INSERT_RADIUS_PX * ctx.px()) return;
      const id = ctx.shapeIdAt(e);
      const shape = id ? findShape(doc, id)?.shape : null;
      selectedNode = null;
      ctx.store.select(shape && shape.kind === 'path' ? [shape.id] : []);
    },
    move(e, ctx) {
      if (!drag) return;
      const local = toLocal(drag.shape, ctx.toSheet(e));
      const after = drag.kind === 'node'
        ? moveNode(drag.shape, drag.i, [local[0] - drag.start[0], local[1] - drag.start[1]])
        : moveHandle(drag.shape, drag.i, drag.which, local, e.altKey);
      ctx.store.transient(apply(ctx, drag.base, drag.shape, after));
    },
    up(_e, ctx) {
      if (!drag) return;
      drag = null;
      ctx.store.endTransient();
    },
    dblclick(e, ctx) {
      const s = selectedPath(ctx);
      if (!s) return;
      const hit = nearestSegment(s, toLocal(s, ctx.toSheet(e)));
      if (hit.dist > INSERT_RADIUS_PX * ctx.px()) return;
      ctx.store.commit(apply(ctx, ctx.store.doc(), s, insertNode(s, hit.segment, hit.t)));
      selectedNode = hit.segment + 1;
    },
    key(e, ctx) {
      const s = selectedPath(ctx);
      if (!s || selectedNode === null || (e.key !== 'Delete' && e.key !== 'Backspace')) return false;
      const after = removeNode(s, selectedNode);
      selectedNode = null;
      ctx.store.commit(after ? apply(ctx, ctx.store.doc(), s, after) : deleteShapes(ctx.store.doc(), [s.id]));
      return true;
    },
    cancel(ctx) {
      if (!drag) return false;
      drag = null;
      ctx.store.abortTransient();
      return true;
    },
    draw,
  };
}
