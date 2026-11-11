/** Bézier pen (sheet editor spec §2.3). */
import { addShape, partForPoint } from '../commands';
import type { PathNode, PathShape, Vec2 } from '../model';
import { pathData } from '../serialize';
import type { Tool, ToolCtx } from './types';

const CLOSE_RADIUS_PX = 8;
const n = (v: number) => String(Math.round(v * 1000) / 1000);

export function createPenTool(): Tool {
  let nodes: PathNode[] | null = null;
  let dragging = false;
  let hover: Vec2 | null = null;

  function reset(ctx: ToolCtx) { nodes = null; dragging = false; hover = null; ctx.layer.innerHTML = ''; }
  function finish(ctx: ToolCtx, closed: boolean) {
    const ns = nodes;
    reset(ctx);
    if (!ns || ns.length < 2) return;
    const { store } = ctx;
    const { doc, id } = addShape(store.doc(), store.get().active, { kind: 'path', nodes: ns, closed, rotation: 0, style: store.get().style });
    store.commit(doc);
    store.select([id]);
  }
  function draw(ctx: ToolCtx) {
    if (!nodes || !nodes.length) { ctx.layer.innerHTML = ''; return; }
    const px = ctx.px(), st = ctx.store.get().style;
    const shape = { id: 'pen', kind: 'path', nodes, closed: false, rotation: 0, style: st } as PathShape;
    const last = nodes[nodes.length - 1];
    const rubber = hover && !dragging ? `<line class="ctrl-line" x1="${n(last.p[0])}" y1="${n(last.p[1])}" x2="${n(hover[0])}" y2="${n(hover[1])}" stroke-width="${n(px)}"/>` : '';
    const handles = dragging ? `<line class="ctrl-line" x1="${n(last.in[0])}" y1="${n(last.in[1])}" x2="${n(last.out[0])}" y2="${n(last.out[1])}" stroke-width="${n(px)}"/>` : '';
    ctx.layer.innerHTML = `<g pointer-events="none">
      <path d="${pathData(shape)}" fill="${st.fill?.color ?? 'none'}" fill-opacity="${st.fill ? 0.35 : 0}" stroke="#1e88e5" stroke-width="${n(1.5 * px)}"/>
      ${rubber}${handles}
      ${nodes.map((nd, i) => `<circle class="node${i === 0 ? ' sel' : ''}" cx="${n(nd.p[0])}" cy="${n(nd.p[1])}" r="${n(4 * px)}" stroke-width="${n(px)}"/>`).join('')}
    </g>`;
  }

  return {
    id: 'pen',
    cursor: 'crosshair',
    down(e, ctx) {
      const p = ctx.toSheet(e);
      if (nodes && nodes.length >= 2 && Math.hypot(p[0] - nodes[0].p[0], p[1] - nodes[0].p[1]) <= CLOSE_RADIUS_PX * ctx.px()) {
        finish(ctx, true);
        return;
      }
      const first = !nodes;
      nodes = [...(nodes ?? []), { p, in: [p[0], p[1]], out: [p[0], p[1]] }];
      dragging = true;
      if (first) {
        // setActive re-renders (and calls draw), so the node must already exist.
        const part = partForPoint(p, ctx.store.get().active);
        if (part !== ctx.store.get().active) ctx.store.setActive(part);
      }
      draw(ctx);
    },
    move(e, ctx) {
      const p = ctx.toSheet(e);
      if (nodes && dragging) {
        const last = nodes[nodes.length - 1];
        last.out = p;
        if (!e.altKey) last.in = [2 * last.p[0] - p[0], 2 * last.p[1] - p[1]];
      } else hover = p;
      draw(ctx);
    },
    up(_e, ctx) { dragging = false; draw(ctx); },
    key(e, ctx) {
      if (!nodes) return false;
      if (e.key === 'Enter' || e.key === 'Escape') { finish(ctx, false); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        nodes.pop();
        if (!nodes.length) reset(ctx); else draw(ctx);
        return true;
      }
      return false;
    },
    cancel(ctx) {
      if (!nodes) return false;
      reset(ctx);
      return true;
    },
    draw,
  };
}
