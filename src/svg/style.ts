/** CSS cascade for the supported SVG properties (spec 6.1 step 1). */

export const PROPS = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'display', 'visibility', 'color', 'stop-color', 'stop-opacity',
  'clip-path', 'mask', 'filter', 'vector-effect',
] as const;
export type Prop = (typeof PROPS)[number];
export type ComputedStyle = Record<Prop, string> & { cssTransform?: boolean };

const INHERITED = new Set<Prop>([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'visibility', 'color',
]);

export const INITIAL: ComputedStyle = {
  fill: 'black', 'fill-opacity': '1', 'fill-rule': 'nonzero', stroke: 'none', 'stroke-opacity': '1',
  'stroke-width': '1', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-miterlimit': '4',
  'stroke-dasharray': 'none', 'stroke-dashoffset': '0', opacity: '1', display: 'inline',
  visibility: 'visible', color: 'black', 'stop-color': 'black', 'stop-opacity': '1',
  'clip-path': 'none', mask: 'none', filter: 'none', 'vector-effect': 'none',
};

interface Rule { tag?: string; cls?: string; id?: string; spec: number; order: number; decls: [string, string][] }

export interface StyleResolver {
  compute(el: Element, parent: ComputedStyle): ComputedStyle;
  /** Document-level warnings (unsupported selectors, @import). */
  warnings: string[];
}

export function parseDecls(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of text.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const val = part.slice(i + 1).replace(/!important/i, '').trim();
    if (k) out.push([k, val]);
  }
  return out;
}

const SIMPLE = /^([a-zA-Z][\w-]*)?(?:\.([\w-]+))?$|^#([\w-]+)$/;

function parseSheet(css: string, rules: Rule[], warnings: string[]) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@import/i.test(css)) warnings.push('External stylesheet (@import) ignored');
  css = css.replace(/@import[^;]*;/gi, '');
  // Drop @-blocks (e.g. @media, @font-face) wholesale.
  css = css.replace(/@[\w-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  const bad = new Set<string>();
  while ((m = re.exec(css))) {
    const decls = parseDecls(m[2]);
    for (const raw of m[1].split(',')) {
      const sel = raw.trim();
      if (!sel) continue;
      const s = SIMPLE.exec(sel);
      if (!s || (!s[1] && !s[2] && !s[3])) { bad.add(sel); continue; }
      const [, tag, cls, id] = s;
      rules.push({ tag, cls, id, spec: (id ? 100 : 0) + (cls ? 10 : 0) + (tag ? 1 : 0), order: rules.length, decls });
    }
  }
  if (bad.size) warnings.push(`Unsupported CSS selector(s) ignored: ${[...bad].join(', ')}`);
}

export function createStyleResolver(doc: Document): StyleResolver {
  const rules: Rule[] = [];
  const warnings: string[] = [];
  for (const st of Array.from(doc.getElementsByTagNameNS('*', 'style'))) parseSheet(st.textContent ?? '', rules, warnings);
  rules.sort((a, b) => a.spec - b.spec || a.order - b.order);

  const matches = (r: Rule, el: Element) =>
    (!r.tag || r.tag === el.localName) &&
    (!r.id || r.id === el.getAttribute('id')) &&
    (!r.cls || (el.getAttribute('class') ?? '').split(/\s+/).includes(r.cls));

  function compute(el: Element, parent: ComputedStyle): ComputedStyle {
    const out = {} as ComputedStyle;
    for (const p of PROPS) out[p] = INHERITED.has(p) ? parent[p] : INITIAL[p];
    const set = (k: string, val: string) => {
      if (k === 'transform') { out.cssTransform = true; return; }
      if (!(PROPS as readonly string[]).includes(k)) return;
      const p = k as Prop;
      out[p] = val === 'inherit' ? parent[p] : val === 'initial' ? INITIAL[p] : val;
    };
    for (const p of PROPS) { const a = el.getAttribute(p); if (a !== null) set(p, a.trim()); }
    for (const r of rules) if (matches(r, el)) for (const [k, val] of r.decls) set(k, val);
    const inline = el.getAttribute('style');
    if (inline) for (const [k, val] of parseDecls(inline)) set(k, val);
    return out;
  }
  return { compute, warnings };
}
