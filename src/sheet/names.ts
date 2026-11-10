/** Finding part groups by layer name (spec 3.4). */
import { PART_IDS, type PartId } from './layout';

const PARTS_LOWER = new Map(PART_IDS.map((p) => [p.toLowerCase(), p] as const));
const INKSCAPE = 'http://www.inkscape.org/namespaces/inkscape';
const SERIF = 'http://www.serif.com/';

export function tidyName(raw: string): string {
  let s = raw.replace(/_x([0-9a-fA-F]{2})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.trim().toLowerCase().replace(/[\s-]+/g, '_');
  s = s.replace(/_\d+_$/, '');
  s = s.replace(/_\d+$/, '');
  return s;
}

/** All candidate names of an element, in priority order. */
export function groupNames(el: Element): string[] {
  const out: string[] = [];
  const add = (v: string | null) => { if (v) out.push(v); };
  add(el.getAttributeNS(INKSCAPE, 'label') ?? el.getAttribute('inkscape:label'));
  add(el.getAttributeNS(SERIF, 'id') ?? el.getAttribute('serif:id'));
  add(el.getAttribute('data-name'));
  add(el.getAttribute('id'));
  return out;
}

export function matchPart(el: Element): PartId | 'guides' | null {
  for (const n of groupNames(el)) {
    const t = tidyName(n);
    if (t === 'guides') return 'guides';
    const p = PARTS_LOWER.get(t);
    if (p) return p;
  }
  return null;
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function nearMiss(el: Element): PartId | null {
  for (const n of groupNames(el)) {
    const t = tidyName(n);
    for (const [lower, id] of PARTS_LOWER) if (editDistance(t, lower) <= 2) return id;
  }
  return null;
}

const DRAWABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'image', 'text']);
const NON_RENDERED = new Set(['defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'filter']);

export interface FoundParts { parts: Map<PartId, Element>; warnings: { part?: PartId; message: string }[] }

export function findParts(doc: Document): FoundParts {
  const parts = new Map<PartId, Element>();
  const warnings: FoundParts['warnings'] = [];
  let stray = 0;

  function walk(el: Element, insidePart: boolean) {
    if (NON_RENDERED.has(el.localName)) return;
    let inside = insidePart;
    if (el.localName === 'g') {
      const m = matchPart(el);
      if (m === 'guides') return;
      if (m) {
        if (parts.has(m)) warnings.push({ part: m, message: `Duplicate layer for ${m}; using the first one` });
        else parts.set(m, el);
        inside = true;
      } else {
        const near = nearMiss(el);
        if (near) warnings.push({ message: `Layer '${groupNames(el)[0]}' not recognised. Did you mean ${near}?` });
      }
    } else if (!insidePart && DRAWABLE.has(el.localName)) {
      stray++;
    }
    for (const c of Array.from(el.children)) walk(c, inside);
  }
  walk(doc.documentElement, false);
  if (stray) warnings.push({ message: `${stray} element(s) outside every part layer were ignored` });
  return { parts, warnings };
}

/** Part groups nested inside `group` that belong to other parts (excluded from it). */
export function nestedPartGroups(group: Element): Element[] {
  return Array.from(group.getElementsByTagNameNS('*', 'g')).filter((g) => {
    const m = matchPart(g);
    return m !== null && m !== 'guides';
  });
}
