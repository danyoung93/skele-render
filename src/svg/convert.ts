/** Part group → Lottie shape items (spec 6). */
import type { Group, PathShape, ShapeItem } from '../lottie/types';
import { identityTr, stat } from '../lottie/types';
import { bbox, elementToSubpaths, toLottiePath, transformSubpath, UnsupportedLength, type Subpath } from './geometry';
import { mul, parseTransform, scale, translate, IDENTITY, type Mat } from './matrix';
import { findById, makeFill, makeStroke } from './paint';
import { INITIAL, type ComputedStyle, type StyleResolver } from './style';

export interface ConvertContext {
  doc: Document;
  styles: StyleResolver;
  /** Sheet user space → reference units. */
  sheetMatrix: Mat;
  /** Sheet viewport size in user units. */
  viewport: number;
  /** Elements to leave out (nested part groups, guides). */
  skip?: Set<Element>;
}

export interface ConvertResult { shapes: ShapeItem[]; warnings: string[] }

const MAX_USE_DEPTH = 10;
const CONTAINERS = new Set(['g', 'a', 'switch', 'svg']);
const SILENT = new Set([
  'title', 'desc', 'metadata', 'defs', 'namedview', 'style', 'linearGradient', 'radialGradient',
  'clipPath', 'mask', 'symbol', 'marker', 'pattern', 'filter', 'stop',
]);
const UNSUPPORTED_EL: Record<string, string> = {
  image: 'Embedded image ignored',
  text: 'Text ignored (convert text to outlines first)',
  foreignObject: 'foreignObject ignored',
  script: 'Script ignored',
};

const hrefOf = (el: Element) => el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');

/** Style, matrix and opacity in effect at `el`'s parent, from the root down. */
function ancestry(el: Element, ctx: ConvertContext): { style: ComputedStyle; matrix: Mat; opacity: number; hidden: boolean } {
  const chain: Element[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) chain.unshift(p);
  let style = INITIAL, matrix = ctx.sheetMatrix, opacity = 1, hidden = false;
  chain.forEach((a, i) => {
    style = ctx.styles.compute(a, style);
    if (style.display === 'none') hidden = true;
    if (i > 0) { // root <svg>: its viewBox is already in sheetMatrix
      matrix = mul(matrix, parseTransform(a.getAttribute('transform')));
      opacity *= parseFloat(style.opacity) || 0;
    }
  });
  return { style, matrix, opacity, hidden };
}

export function convertPart(group: Element, ctx: ConvertContext): ConvertResult {
  const warnings = new Set<string>();
  const warn = (m: string) => warnings.add(m);
  const items: Group[] = [];
  const anc = ancestry(group, ctx);
  if (anc.hidden) return { shapes: [], warnings: [] };

  type Size = { w?: number; h?: number } | null;
  function visit(el: Element, m: Mat, parent: ComputedStyle, opacity: number, depth: number, useSize: Size) {
    const viaUse = useSize !== null;
    const tag = el.localName;
    if (ctx.skip?.has(el) && el !== group) return;
    if (UNSUPPORTED_EL[tag]) { warn(UNSUPPORTED_EL[tag]); return; }
    if (SILENT.has(tag) && !(viaUse && tag === 'symbol')) return;

    const style = ctx.styles.compute(el, parent);
    if (style.display === 'none') return;
    if (style['clip-path'] !== 'none') warn('Clip path ignored');
    if (style.mask !== 'none') warn('Mask ignored');
    if (style.filter !== 'none') warn('Filter ignored');
    if (style['vector-effect'] !== 'none') warn('vector-effect ignored');
    if (style.cssTransform) warn('CSS transform property ignored (use the transform attribute)');

    const own = mul(m, parseTransform(el.getAttribute('transform')));
    const op = opacity * (isNaN(parseFloat(style.opacity)) ? 1 : parseFloat(style.opacity));

    if (CONTAINERS.has(tag) || tag === 'symbol') {
      let inner = own;
      if (tag === 'svg' || tag === 'symbol') inner = mul(own, viewBoxMatrix(el, useSize?.w, useSize?.h));
      for (const c of Array.from(el.children)) visit(c, inner, style, op, depth, null);
      return;
    }
    if (tag === 'use') {
      const href = hrefOf(el);
      if (!href) return;
      if (!href.startsWith('#')) { warn(`External reference ignored: ${href}`); return; }
      if (depth >= MAX_USE_DEPTH) { warn('<use> nesting too deep (possible cycle); stopped'); return; }
      const target = findById(ctx.doc, href.slice(1));
      if (!target) return;
      const x = parseFloat(el.getAttribute('x') ?? '0') || 0, y = parseFloat(el.getAttribute('y') ?? '0') || 0;
      const size = {
        w: parseFloat(el.getAttribute('width') ?? '') || undefined,
        h: parseFloat(el.getAttribute('height') ?? '') || undefined,
      };
      visit(target, mul(own, translate(x, y)), style, op, depth + 1, size);
      return;
    }

    let sps: Subpath[] | null;
    try {
      sps = elementToSubpaths(el);
    } catch (e) {
      warn(e instanceof UnsupportedLength ? `Unsupported length unit (${e.message}); element skipped` : `Bad path data; element skipped`);
      return;
    }
    if (!sps || !sps.length || style.visibility === 'hidden' || style.visibility === 'collapse') return;
    const box = bbox(sps)!;
    const pctx = { doc: ctx.doc, styles: ctx.styles, matrix: own, bbox: box, opacity: op, viewport: ctx.viewport, warn };
    const stroke = makeStroke(style, pctx);
    const fill = makeFill(style, pctx);
    if (!stroke && !fill) return;
    const paths: PathShape[] = sps.map((sp) => ({ ty: 'sh', ks: stat(toLottiePath(transformSubpath(sp, own))) }));
    const it: ShapeItem[] = [...paths];
    if (stroke) it.push(stroke);
    if (fill) it.push(fill);
    it.push(identityTr());
    items.push({ ty: 'gr', nm: el.getAttribute('id') ?? tag, it });
  }

  visit(group, anc.matrix, anc.style, anc.opacity, 0, null);
  for (const w of ctx.styles.warnings) warnings.delete(w);
  return { shapes: items.reverse(), warnings: [...warnings] };
}

/** viewBox → viewport mapping for nested <svg>/<symbol> (preserveAspectRatio xMidYMid meet). */
function viewBoxMatrix(el: Element, w?: number, h?: number): Mat {
  const vb = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const x = parseFloat(el.getAttribute('x') ?? '0') || 0, y = parseFloat(el.getAttribute('y') ?? '0') || 0;
  const pos = el.localName === 'svg' ? translate(x, y) : IDENTITY;
  if (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0) return pos;
  const W = w ?? (parseFloat(el.getAttribute('width') ?? '') || vb[2]);
  const H = h ?? (parseFloat(el.getAttribute('height') ?? '') || vb[3]);
  const s = Math.min(W / vb[2], H / vb[3]);
  const tx = (W - vb[2] * s) / 2, ty = (H - vb[3] * s) / 2;
  return mul(mul(pos, translate(tx, ty)), mul(scale(s), translate(-vb[0], -vb[1])));
}

/** Recursive control-point bbox of converted shape items (reference units). */
export function shapesBBox(items: ShapeItem[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (its: ShapeItem[]) => {
    for (const it of its) {
      if (it.ty === 'gr') walk(it.it);
      else if (it.ty === 'sh') {
        const d = it.ks.k;
        d.v.forEach((p, i) => {
          for (const q of [p, [p[0] + d.i[i][0], p[1] + d.i[i][1]], [p[0] + d.o[i][0], p[1] + d.o[i][1]]]) {
            x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
          }
        });
      }
    }
  };
  walk(items);
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
