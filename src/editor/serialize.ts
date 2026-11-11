/** Editor document → template-layout SVG (sheet editor spec §4.1). */
import { PART_IDS, REF_SIZE } from '../sheet/layout';
import { guidesLayer } from '../sheet/template';
import { resolvedParts } from './mirror';
import { centre, type EditorDoc, type EditorShape, type Style } from './model';

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function styleAttrs(st: Style): string {
  const out: string[] = [];
  if (st.fill) {
    out.push(`fill="${st.fill.color}"`);
    if (st.fill.opacity < 1) out.push(`fill-opacity="${n(st.fill.opacity)}"`);
  } else out.push('fill="none"');
  if (st.stroke) {
    out.push(`stroke="${st.stroke.color}"`, `stroke-width="${n(st.strokeWidth)}"`, 'stroke-linecap="round"', 'stroke-linejoin="round"');
    if (st.stroke.opacity < 1) out.push(`stroke-opacity="${n(st.stroke.opacity)}"`);
  }
  return out.join(' ');
}

export function pathData(s: Extract<EditorShape, { kind: 'path' }>): string {
  const ns = s.nodes;
  if (!ns.length) return '';
  const parts = [`M${n(ns[0].p[0])} ${n(ns[0].p[1])}`];
  const seg = (a: (typeof ns)[number], b: (typeof ns)[number]) =>
    `C${n(a.out[0])} ${n(a.out[1])} ${n(b.in[0])} ${n(b.in[1])} ${n(b.p[0])} ${n(b.p[1])}`;
  for (let i = 1; i < ns.length; i++) parts.push(seg(ns[i - 1], ns[i]));
  if (s.closed) parts.push(seg(ns[ns.length - 1], ns[0]), 'Z');
  return parts.join(' ');
}

export function shapeSvg(s: EditorShape, extra = ''): string {
  const c = centre(s);
  const tr = s.rotation ? ` transform="rotate(${n(s.rotation)} ${n(c[0])} ${n(c[1])})"` : '';
  const st = styleAttrs(s.style) + tr + extra;
  switch (s.kind) {
    case 'ellipse': return `<ellipse cx="${n(s.cx)}" cy="${n(s.cy)}" rx="${n(s.rx)}" ry="${n(s.ry)}" ${st}/>`;
    case 'rect': return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"${s.r > 0 ? ` rx="${n(s.r)}"` : ''} ${st}/>`;
    case 'path': return `<path d="${pathData(s)}" ${st}/>`;
  }
}

export function serialize(doc: EditorDoc): string {
  const parts = resolvedParts(doc);
  const layers = PART_IDS.map((p) => {
    const shapes = parts[p].map((s) => `    ${shapeSvg(s)}`).join('\n');
    return `  <g id="${p}" inkscape:groupmode="layer" inkscape:label="${p}">\n${shapes}\n  </g>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${REF_SIZE} ${REF_SIZE}" width="${REF_SIZE}" height="${REF_SIZE}" data-character-name="${esc(doc.name)}"${doc.mirrorArms ? ` data-mirror-arms="${doc.mirrorArms}"` : ''}>
${layers}
  ${guidesLayer()}
</svg>
`;
}
