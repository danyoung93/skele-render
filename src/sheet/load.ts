/** SVG sheet loader (spec 3.5). */
import type { ShapeItem } from '../lottie/types';
import { convertPart, shapesBBox } from '../svg/convert';
import { parseLength } from '../svg/geometry';
import { mul, scale, translate, type Mat } from '../svg/matrix';
import { createStyleResolver } from '../svg/style';
import { AREAS, MIN_GAP, PART_IDS, REF_SIZE, type PartId } from './layout';
import { findParts, matchPart } from './names';

export class SheetError extends Error {}
export interface SheetWarning { part?: PartId; message: string }
export interface LoadedSheet {
  name: string;
  svgText: string;
  parts: Record<PartId, ShapeItem[] | null>;
  warnings: SheetWarning[];
}

export function sheetName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').toLowerCase();
  return base.replace(/[^a-z0-9-]/g, '-') || 'sheet';
}

export function parseSvg(text: string): Document {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  } catch (e) {
    throw new SheetError(`Not valid SVG: ${(e as Error).message}`);
  }
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new SheetError(`Not valid SVG: ${(err.textContent ?? '').trim().split('\n')[0]}`);
  if (doc.documentElement?.localName !== 'svg') throw new SheetError('Not an SVG file (root element is not <svg>)');
  return doc;
}

/** Sheet user space → reference units, plus the viewport size in user units. */
export function sheetMapping(root: Element): { matrix: Mat; size: number } {
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  let x = 0, y = 0, w: number | null, h: number | null;
  if (vb.length === 4 && vb.every((n) => isFinite(n))) [x, y, w, h] = vb;
  else {
    w = parseLength(root.getAttribute('width'), null);
    h = parseLength(root.getAttribute('height'), null);
  }
  if (!w || !h || w <= 0 || h <= 0) throw new SheetError('Sheet has no usable viewBox (or numeric width and height)');
  if (Math.abs(w - h) > 0.001 * Math.max(w, h)) {
    throw new SheetError(`Sheet must be square (e.g. viewBox "0 0 1024 1024"); got ${w} × ${h}`);
  }
  return { matrix: mul(scale(REF_SIZE / w), translate(-x, -y)), size: w };
}

export function loadSheet(text: string, fileName: string): LoadedSheet {
  const doc = parseSvg(text);
  const { matrix, size } = sheetMapping(doc.documentElement);
  const found = findParts(doc);
  if (found.parts.size === 0) throw new SheetError('No part layers found. Is this based on the template?');

  const warnings: SheetWarning[] = [...found.warnings];
  if (doc.getElementsByTagNameNS('*', 'script').length) warnings.push({ message: 'Scripts ignored' });
  const hasHandlers = Array.from(doc.getElementsByTagName('*')).some((el) =>
    Array.from(el.attributes).some((a) => /^on/i.test(a.name)));
  if (hasHandlers) warnings.push({ message: 'Event handler attributes ignored' });

  const styles = createStyleResolver(doc);
  for (const w of styles.warnings) warnings.push({ message: w });

  const skip = new Set<Element>();
  for (const g of Array.from(doc.getElementsByTagNameNS('*', 'g'))) if (matchPart(g)) skip.add(g);

  const parts = {} as Record<PartId, ShapeItem[] | null>;
  for (const id of PART_IDS) {
    const g = found.parts.get(id);
    if (!g) {
      parts[id] = null;
      warnings.push({ part: id, message: `${id} layer is missing; part hidden` });
      continue;
    }
    const r = convertPart(g, { doc, styles, sheetMatrix: matrix, viewport: size, skip });
    for (const m of r.warnings) warnings.push({ part: id, message: m });
    if (!r.shapes.length) {
      parts[id] = null;
      warnings.push({ part: id, message: `${id} layer is empty; part hidden` });
      continue;
    }
    parts[id] = r.shapes;
    const b = shapesBBox(r.shapes)!, a = AREAS[id];
    if (b.x0 < a.x - MIN_GAP || b.y0 < a.y - MIN_GAP || b.x1 > a.x + a.w + MIN_GAP || b.y1 > a.y + a.h + MIN_GAP) {
      warnings.push({ part: id, message: `${id} is drawn outside its box` });
    }
  }
  return { name: sheetName(fileName), svgText: text, parts, warnings };
}
