/** Loaded sheet → editable document (sheet editor spec §4.2). */
import type { GradientCommon, Group, ShapeItem } from '../lottie/types';
import { PART_IDS, type PartId } from '../sheet/layout';
import type { LoadedSheet } from '../sheet/load';
import { addShape } from './commands';
import { emptyDoc, type EditorDoc, type Paint, type PathNode, type Style, type Vec2 } from './model';

const hex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const firstStop = (g: GradientCommon): Paint => ({ color: hex(g.g.k.k.slice(1, 4)), opacity: g.o.k / 100 });

export function importSheet(sheet: LoadedSheet): { doc: EditorDoc; warnings: { part: PartId; message: string }[] } {
  let doc = emptyDoc(sheet.name);
  const warnings: { part: PartId; message: string }[] = [];
  for (const part of PART_IDS) {
    const items = sheet.parts[part];
    if (!items) continue;
    const warned = new Set<string>();
    const warn = (message: string) => { if (!warned.has(message)) { warned.add(message); warnings.push({ part, message }); } };
    // Shape items are listed front to back; the editor stores back to front.
    const groups = items.filter((i): i is Group => i.ty === 'gr').reverse();
    for (const g of groups) {
      const style: Style = { fill: null, stroke: null, strokeWidth: 4 };
      let holes = false;
      for (const it of g.it as ShapeItem[]) {
        if (it.ty === 'fl') { style.fill = { color: hex(it.c.k), opacity: it.o.k / 100 }; holes ||= it.r === 2; }
        if (it.ty === 'gf') { style.fill = firstStop(it); holes ||= it.r === 2; warn('gradient flattened to its first colour'); }
        if (it.ty === 'st' || it.ty === 'gs') {
          style.stroke = it.ty === 'st' ? { color: hex(it.c.k), opacity: it.o.k / 100 } : firstStop(it);
          style.strokeWidth = it.w.k;
          if (it.ty === 'gs') warn('gradient flattened to its first colour');
          if (it.d?.length) warn('dashes removed');
        }
      }
      const paths = g.it.filter((i) => i.ty === 'sh');
      if (holes && paths.length > 1) warn('shape with holes may fill its holes');
      for (const sh of paths) {
        if (sh.ty !== 'sh') continue;
        const { v, i, o, c } = sh.ks.k;
        const nodes: PathNode[] = v.map((p, k) => ({
          p: [p[0], p[1]] as Vec2,
          in: [p[0] + i[k][0], p[1] + i[k][1]] as Vec2,
          out: [p[0] + o[k][0], p[1] + o[k][1]] as Vec2,
        }));
        doc = addShape(doc, part, { kind: 'path', nodes, closed: c, rotation: 0, style: { ...style } }).doc;
      }
    }
  }
  return { doc, warnings };
}
