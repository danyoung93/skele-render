/** Lottie shape items → SVG markup (used to draw the assembled character in the rig editor). */
import type { DashItem, GradientCommon, Group, PathData, ShapeItem } from './types';

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const hex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const CAPS = ['', 'butt', 'round', 'square'], JOINS = ['', 'miter', 'round', 'bevel'];

function pathD(k: PathData): string {
  const { v, i, o, c } = k;
  if (!v.length) return '';
  const parts = [`M${n(v[0][0])} ${n(v[0][1])}`];
  const seg = (a: number, b: number) =>
    `C${n(v[a][0] + o[a][0])} ${n(v[a][1] + o[a][1])} ${n(v[b][0] + i[b][0])} ${n(v[b][1] + i[b][1])} ${n(v[b][0])} ${n(v[b][1])}`;
  for (let k2 = 1; k2 < v.length; k2++) parts.push(seg(k2 - 1, k2));
  if (c) parts.push(seg(v.length - 1, 0), 'Z');
  return parts.join(' ');
}

function gradientDef(g: GradientCommon, id: string): string {
  const k = g.g.k.k, p = g.g.p;
  const colours = Array.from({ length: p }, (_, i) => k.slice(i * 4, i * 4 + 4));
  const alphas: [number, number][] = [];
  for (let i = p * 4; i + 1 < k.length; i += 2) alphas.push([k[i], k[i + 1]]);
  const alphaAt = (off: number) => {
    if (!alphas.length) return 1;
    if (off <= alphas[0][0]) return alphas[0][1];
    for (let i = 1; i < alphas.length; i++) {
      const [o0, a0] = alphas[i - 1], [o1, a1] = alphas[i];
      if (off <= o1) return o1 === o0 ? a1 : a0 + ((a1 - a0) * (off - o0)) / (o1 - o0);
    }
    return alphas[alphas.length - 1][1];
  };
  const stops = colours.map(([o, r, gg, b]) => {
    const a = alphaAt(o);
    return `<stop offset="${n(o)}" stop-color="${hex([r, gg, b])}"${a < 1 ? ` stop-opacity="${n(a)}"` : ''}/>`;
  }).join('');
  const [sx, sy] = g.s.k, [ex, ey] = g.e.k;
  if (g.t === 1) return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(sx)}" y1="${n(sy)}" x2="${n(ex)}" y2="${n(ey)}">${stops}</linearGradient>`;
  const r = Math.hypot(ex - sx, ey - sy);
  const h = Math.max(-99, Math.min(99, g.h?.k ?? 0)) / 100, ang = Math.atan2(ey - sy, ex - sx) + ((g.a?.k ?? 0) * Math.PI) / 180;
  const fx = sx + Math.cos(ang) * r * h, fy = sy + Math.sin(ang) * r * h;
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(sx)}" cy="${n(sy)}" r="${n(r)}" fx="${n(fx)}" fy="${n(fy)}">${stops}</radialGradient>`;
}

function dashAttrs(d: DashItem[] | undefined): string {
  if (!d?.length) return '';
  const arr = d.filter((x) => x.n !== 'o').map((x) => n(x.v.k)), off = d.find((x) => x.n === 'o');
  return ` stroke-dasharray="${arr.join(' ')}"${off ? ` stroke-dashoffset="${n(off.v.k)}"` : ''}`;
}

/** Items are listed front to back (Lottie); SVG draws later elements on top, so groups are reversed. */
export function shapeItemsToSvg(items: ShapeItem[], idPrefix: string): string {
  let counter = 0;
  const groupSvg = (g: Group): string => {
    const nested = g.it.filter((x): x is Group => x.ty === 'gr');
    const d = g.it.filter((x) => x.ty === 'sh').map((x) => (x.ty === 'sh' ? pathD(x.ks.k) : '')).join(' ');
    let defs = '', attrs = '';
    for (const it of g.it) {
      if (it.ty === 'fl') attrs += ` fill="${hex(it.c.k)}" fill-opacity="${n(it.o.k / 100)}"${it.r === 2 ? ' fill-rule="evenodd"' : ''}`;
      if (it.ty === 'gf') { const id = `${idPrefix}g${counter++}`; defs += gradientDef(it, id); attrs += ` fill="url(#${id})" fill-opacity="${n(it.o.k / 100)}"${it.r === 2 ? ' fill-rule="evenodd"' : ''}`; }
      if (it.ty === 'st') attrs += ` stroke="${hex(it.c.k)}" stroke-opacity="${n(it.o.k / 100)}" stroke-width="${n(it.w.k)}" stroke-linecap="${CAPS[it.lc]}" stroke-linejoin="${JOINS[it.lj]}" stroke-miterlimit="${n(it.ml)}"${dashAttrs(it.d)}`;
      if (it.ty === 'gs') { const id = `${idPrefix}g${counter++}`; defs += gradientDef(it, id); attrs += ` stroke="url(#${id})" stroke-opacity="${n(it.o.k / 100)}" stroke-width="${n(it.w.k)}" stroke-linecap="${CAPS[it.lc]}" stroke-linejoin="${JOINS[it.lj]}" stroke-miterlimit="${n(it.ml)}"${dashAttrs(it.d)}`; }
    }
    if (!/ fill=/.test(attrs)) attrs = ' fill="none"' + attrs;
    const own = d ? `${defs ? `<defs>${defs}</defs>` : ''}<path d="${d}"${attrs}/>` : '';
    return [...nested].reverse().map(groupSvg).join('') + own;
  };
  return items.filter((x): x is Group => x.ty === 'gr').reverse().map(groupSvg).join('');
}
