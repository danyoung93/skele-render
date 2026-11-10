/** Fill/stroke paint → Lottie items (spec 6.1 step 3, 6.2, 6.3). */
import type { DashItem, Fill, GradFill, GradStroke, GradientCommon, Stroke, Vec2 } from '../lottie/types';
import { stat } from '../lottie/types';
import { parseColor, type RGBA } from './colors';
import { apply, mul, parseTransform, scaleFactor, type Mat } from './matrix';
import type { ComputedStyle, StyleResolver } from './style';
import { INITIAL } from './style';

export interface PaintCtx {
  doc: Document;
  styles: StyleResolver;
  /** Full matrix from the element's user space to reference units. */
  matrix: Mat;
  /** Untransformed bounding box of the element, for objectBoundingBox gradients. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Product of ancestor and own `opacity`. */
  opacity: number;
  /** Viewport size in user units, for percentages in userSpaceOnUse gradients. */
  viewport: number;
  warn: (msg: string) => void;
}

type Paint =
  | { kind: 'none' }
  | { kind: 'color'; c: RGBA }
  | { kind: 'gradient'; el: Element };

const URL_RE = /^url\(\s*['"]?([^'")]+)['"]?\s*\)\s*(.*)$/;

export function resolvePaint(value: string, style: ComputedStyle, ctx: PaintCtx): Paint {
  const v = value.trim();
  if (v === 'none' || v === '') return { kind: 'none' };
  const m = URL_RE.exec(v);
  if (m) {
    const ref = m[1], fallback = m[2].trim();
    const fb = (): Paint => (fallback ? resolvePaint(fallback, style, ctx) : { kind: 'none' });
    if (!ref.startsWith('#')) { ctx.warn(`External paint reference ignored: ${ref}`); return fb(); }
    const target = findById(ctx.doc, ref.slice(1));
    if (!target) return fb();
    if (target.localName === 'linearGradient' || target.localName === 'radialGradient') return { kind: 'gradient', el: target };
    ctx.warn(`${target.localName} paint not supported`);
    return fb();
  }
  if (v === 'currentColor' || v === 'currentcolor') {
    const c = parseColor(style.color);
    return c ? { kind: 'color', c } : { kind: 'none' };
  }
  const c = parseColor(v);
  if (!c) { ctx.warn(`Unrecognised colour "${v}"`); return { kind: 'none' }; }
  return { kind: 'color', c };
}

export function findById(doc: Document, id: string): Element | null {
  // getElementById is unreliable for XML documents in some engines.
  return doc.getElementById(id) ?? doc.querySelector(`[id="${CSS_escape(id)}"]`);
}
const CSS_escape = (s: string) => s.replace(/["\\]/g, '\\$&');

const num = (s: string | null | undefined, d: number) => {
  if (s === null || s === undefined || s.trim() === '') return d;
  const n = parseFloat(s);
  return isNaN(n) ? d : n;
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number) => Math.round(clamp01(n) * 10000) / 100;

interface GradInfo {
  type: 'linear' | 'radial';
  attrs: Map<string, string>;
  stops: Element[];
}

/** Follows href chains, collecting attributes (first wins) and the first non-empty stop list. */
function collectGradient(el: Element, ctx: PaintCtx): GradInfo {
  const attrs = new Map<string, string>();
  let stops: Element[] = [];
  const seen = new Set<Element>();
  let cur: Element | null = el;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    for (const a of ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform', 'spreadMethod']) {
      const val = cur.getAttribute(a);
      if (val !== null && !attrs.has(a)) attrs.set(a, val);
    }
    if (!stops.length) stops = Array.from(cur.children).filter((c) => c.localName === 'stop');
    const href = cur.getAttribute('href') ?? cur.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!href) break;
    if (!href.startsWith('#')) { ctx.warn(`External gradient reference ignored: ${href}`); break; }
    cur = findById(ctx.doc, href.slice(1));
  }
  return { type: el.localName === 'radialGradient' ? 'radial' : 'linear', attrs, stops };
}

function gradientCommon(el: Element, ctx: PaintCtx, alphaMul: number): GradientCommon | null {
  const g = collectGradient(el, ctx);
  if (!g.stops.length) return null;
  const obb = (g.attrs.get('gradientUnits') ?? 'objectBoundingBox') === 'objectBoundingBox';
  const coord = (name: string, d: string): number => {
    const raw = (g.attrs.get(name) ?? d).trim();
    const n = parseFloat(raw);
    if (raw.endsWith('%')) return obb ? n / 100 : (n / 100) * ctx.viewport;
    return n;
  };
  const sm = g.attrs.get('spreadMethod');
  if (sm && sm !== 'pad') ctx.warn(`spreadMethod="${sm}" not supported; using pad`);
  const b = ctx.bbox;
  const bm: Mat = obb ? [b.x1 - b.x0, 0, 0, b.y1 - b.y0, b.x0, b.y0] : [1, 0, 0, 1, 0, 0];
  const G = mul(mul(ctx.matrix, bm), parseTransform(g.attrs.get('gradientTransform')));

  // Stops: offsets monotonic, colours via the cascade (stop-color / stop-opacity).
  const colours: number[] = [], alphas: number[] = [];
  let prev = 0;
  for (const s of g.stops) {
    const st = ctx.styles.compute(s, INITIAL);
    const rawOff = s.getAttribute('offset') ?? '0';
    let off = rawOff.trim().endsWith('%') ? parseFloat(rawOff) / 100 : num(rawOff, 0);
    off = Math.max(prev, clamp01(off)); prev = off;
    const c = parseColor(st['stop-color']) ?? { r: 0, g: 0, b: 0, a: 1 };
    const r3 = (n: number) => Math.round(n * 10000) / 10000;
    colours.push(r3(off), r3(c.r), r3(c.g), r3(c.b));
    alphas.push(r3(off), r3(clamp01(c.a * num(st['stop-opacity'], 1))));
  }
  const common: GradientCommon = {
    t: 1, s: stat([0, 0]), e: stat([0, 0]), o: stat(pct(alphaMul)),
    g: { p: g.stops.length, k: stat([...colours, ...alphas]) },
  };
  const r2 = (p: Vec2): Vec2 => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
  if (g.type === 'linear') {
    common.s = stat(r2(apply(G, [coord('x1', '0%'), coord('y1', '0%')])));
    common.e = stat(r2(apply(G, [coord('x2', '100%'), coord('y2', '0%')])));
  } else {
    common.t = 2;
    const cx = coord('cx', '50%'), cy = coord('cy', '50%'), r = coord('r', '50%');
    const fx = g.attrs.has('fx') ? coord('fx', '50%') : cx, fy = g.attrs.has('fy') ? coord('fy', '50%') : cy;
    const c = apply(G, [cx, cy]);
    const rad = r * scaleFactor(G);
    const f = apply(G, [fx, fy]);
    common.s = stat(r2(c));
    common.e = stat(r2([c[0] + rad, c[1]]));
    const dist = Math.hypot(f[0] - c[0], f[1] - c[1]);
    common.h = stat(rad > 0 ? Math.min(99, Math.round((dist / rad) * 10000) / 100) : 0);
    common.a = stat(dist > 1e-6 ? Math.round((Math.atan2(f[1] - c[1], f[0] - c[0]) * 180) / Math.PI * 100) / 100 : 0);
  }
  return common;
}

const fillRule = (s: ComputedStyle): 1 | 2 => (s['fill-rule'] === 'evenodd' ? 2 : 1);
const colorArr = (c: RGBA) => [c.r, c.g, c.b, 1].map((n) => Math.round(n * 10000) / 10000);

export function makeFill(style: ComputedStyle, ctx: PaintCtx): Fill | GradFill | null {
  const paint = resolvePaint(style.fill, style, ctx);
  const alpha = num(style['fill-opacity'], 1) * ctx.opacity;
  if (paint.kind === 'none') return null;
  if (paint.kind === 'color') {
    return { ty: 'fl', c: stat(colorArr(paint.c)), o: stat(pct(alpha * paint.c.a)), r: fillRule(style) };
  }
  const g = gradientCommon(paint.el, ctx, alpha);
  return g ? { ty: 'gf', ...g, r: fillRule(style) } : null;
}

const CAPS: Record<string, 1 | 2 | 3> = { butt: 1, round: 2, square: 3 };
const JOINS: Record<string, 1 | 2 | 3> = { miter: 1, 'miter-clip': 1, arcs: 1, round: 2, bevel: 3 };

export function makeStroke(style: ComputedStyle, ctx: PaintCtx): Stroke | GradStroke | null {
  const paint = resolvePaint(style.stroke, style, ctx);
  if (paint.kind === 'none') return null;
  const k = scaleFactor(ctx.matrix);
  const width = num(style['stroke-width'], 1) * k;
  if (width <= 0) return null;
  const alpha = num(style['stroke-opacity'], 1) * ctx.opacity;
  const base = {
    w: stat(Math.round(width * 1000) / 1000),
    lc: CAPS[style['stroke-linecap']] ?? 1,
    lj: JOINS[style['stroke-linejoin']] ?? 1,
    ml: num(style['stroke-miterlimit'], 4),
  };
  const d = dashes(style, k);
  if (paint.kind === 'color') {
    const st: Stroke = { ty: 'st', c: stat(colorArr(paint.c)), o: stat(pct(alpha * paint.c.a)), ...base };
    if (d) st.d = d;
    return st;
  }
  const g = gradientCommon(paint.el, ctx, alpha);
  if (!g) return null;
  const gs: GradStroke = { ty: 'gs', ...g, ...base };
  if (d) gs.d = d;
  return gs;
}

function dashes(style: ComputedStyle, k: number): DashItem[] | null {
  const raw = style['stroke-dasharray'];
  if (!raw || raw === 'none') return null;
  let arr = raw.split(/[\s,]+/).filter(Boolean).map(parseFloat).filter((n) => !isNaN(n) && n >= 0);
  if (!arr.length || arr.every((n) => n === 0)) return null;
  if (arr.length % 2) arr = [...arr, ...arr];
  const out: DashItem[] = arr.map((n, i) => ({
    n: i % 2 ? 'g' : 'd', nm: i % 2 ? 'gap' : 'dash', v: stat(Math.round(n * k * 1000) / 1000),
  }));
  out.push({ n: 'o', nm: 'offset', v: stat(Math.round(num(style['stroke-dashoffset'], 0) * k * 1000) / 1000) });
  return out;
}
