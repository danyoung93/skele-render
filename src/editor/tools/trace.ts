/** Trace tool: click a flat-colour area of the reference to create a matching path (trace tool spec §2). */
import { AREAS } from '../../sheet/layout';
import { traceAt, type TraceResult } from '../../trace/trace';
import { addShape, partForPoint } from '../commands';
import { mirrorRefusal } from '../mirror';
import type { PathNode, Vec2 } from '../model';
import type { Tool, ToolCtx } from './types';

const MARGIN = 32;
const HOVER_MS = 100;
const n = (v: number) => String(Math.round(v * 1000) / 1000);
const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Traces at a sheet point, reading only the part box (+ margin) from the reference image. */
function traceSheet(ctx: ToolCtx, p: Vec2): { result: TraceResult; toSheet: (q: Vec2) => Vec2; part: ReturnType<typeof partForPoint> } | null {
  const { store } = ctx;
  const img = store.get().reference, r = store.doc().reference;
  if (!img || !r.hasImage) return null;
  const part = partForPoint(p, store.get().active), a = AREAS[part];
  const toImg = (q: Vec2): Vec2 => [(q[0] - r.x) / r.scale, (q[1] - r.y) / r.scale];
  const tl = toImg([a.x - MARGIN, a.y - MARGIN]), br = toImg([a.x + a.w + MARGIN, a.y + a.h + MARGIN]);
  const lx0 = Math.max(0, Math.floor(tl[0])), ly0 = Math.max(0, Math.floor(tl[1]));
  const lx1 = Math.min(img.w, Math.ceil(br[0])), ly1 = Math.min(img.h, Math.ceil(br[1]));
  const seed = toImg(p);
  const toSheet = (q: Vec2): Vec2 => [r.x + (q[0] + lx0) * r.scale, r.y + (q[1] + ly0) * r.scale];
  if (seed[0] < 0 || seed[1] < 0 || seed[0] >= img.w || seed[1] >= img.h || lx1 <= lx0 || ly1 <= ly0) {
    return { result: { error: 'outside' }, toSheet, part };
  }
  // The part's box (plus margin) is the search limit, so only that window of pixels is read.
  const data = img.pixels.getImageData(lx0, ly0, lx1 - lx0, ly1 - ly0);
  const { traceTolerance: tolerance, traceSmoothness: smoothness } = store.get();
  const local: Vec2 = [seed[0] - lx0, seed[1] - ly0];
  // The window is the limit; its edges count as "the limit" unless they are the image's own edges.
  const result = traceAt(
    { width: data.width, height: data.height, data: data.data },
    local,
    { tolerance, smoothness, limit: { x0: 0, y0: 0, x1: data.width, y1: data.height }, edgesAreLimits: { left: lx0 > 0, top: ly0 > 0, right: lx1 < img.w, bottom: ly1 < img.h } },
  );
  return { result, toSheet, part };
}

const mapNodes = (nodes: PathNode[], f: (q: Vec2) => Vec2): PathNode[] => nodes.map((nd) => ({ p: f(nd.p), in: f(nd.in), out: f(nd.out) }));
function pathD(nodes: PathNode[]): string {
  if (!nodes.length) return '';
  const parts = [`M${n(nodes[0].p[0])} ${n(nodes[0].p[1])}`];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    parts.push(`C${n(a.out[0])} ${n(a.out[1])} ${n(b.in[0])} ${n(b.in[1])} ${n(b.p[0])} ${n(b.p[1])}`);
  }
  return parts.join(' ') + ' Z';
}

export function createTraceTool(): Tool {
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHover: Vec2 | null = null;

  function preview(ctx: ToolCtx) {
    hoverTimer = null;
    if (!lastHover) return;
    const t = traceSheet(ctx, lastHover);
    if (!t || 'error' in t.result || mirrorRefusal(ctx.store.doc(), t.part)) { ctx.layer.innerHTML = ''; return; }
    const px = ctx.px(), nodes = mapNodes(t.result.nodes, t.toSheet), c = hex(t.result.colour);
    ctx.layer.innerHTML = `<g data-id="trace-preview" pointer-events="none">
      <path d="${pathD(nodes)}" fill="${c}" fill-opacity="0.25" stroke="#1e88e5" stroke-width="${n(1.5 * px)}" stroke-dasharray="${n(5 * px)} ${n(4 * px)}"/>
      <rect x="${n(lastHover[0] + 12 * px)}" y="${n(lastHover[1] + 12 * px)}" width="${n(16 * px)}" height="${n(16 * px)}" fill="${c}" stroke="#fff" stroke-width="${n(1.5 * px)}"/>
    </g>`;
  }

  return {
    id: 'trace',
    cursor: 'crosshair',
    down(e, ctx) {
      const { store } = ctx;
      const p = ctx.toSheet(e);
      const t = traceSheet(ctx, p);
      if (!t) { store.set({ message: { kind: 'info', text: 'Load a reference image first (Reference image → Load image).' } }); return; }
      const refusal = mirrorRefusal(store.doc(), t.part);
      if (refusal) { store.set({ message: { kind: 'info', text: refusal } }); return; }
      if ('error' in t.result) {
        if (t.result.error === 'too-small') store.set({ message: { kind: 'info', text: 'That area is too small to trace.' } });
        return;
      }
      const nodes = mapNodes(t.result.nodes, t.toSheet);
      const { doc, id } = addShape(store.doc(), t.part, {
        kind: 'path', nodes, closed: true, rotation: 0,
        style: { fill: { color: hex(t.result.colour), opacity: 1 }, stroke: null, strokeWidth: store.get().style.strokeWidth },
      });
      if (t.part !== store.get().active) store.setActive(t.part);
      store.commit(doc);
      store.select([id]);
      store.set({ message: t.result.hitLimit ? { kind: 'info', text: 'This area ran into the edge of the box. Try a lower tolerance.' } : null });
      ctx.layer.innerHTML = '';
    },
    move(e, ctx) {
      lastHover = ctx.toSheet(e);
      if (!hoverTimer) hoverTimer = setTimeout(() => preview(ctx), HOVER_MS);
    },
    up() {},
    cancel(ctx) {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      lastHover = null;
      ctx.layer.innerHTML = '';
      return false;
    },
  };
}
