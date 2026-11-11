import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importSheet } from '../../../src/editor/import';
import { serialize } from '../../../src/editor/serialize';
import { loadSheet } from '../../../src/sheet/load';
import { templateSvg } from '../../../src/sheet/template';
import { shapesBBox } from '../../../src/svg/convert';
import { PART_IDS } from '../../../src/sheet/layout';

describe('importSheet', () => {
  it('round-trips the template within 0.5 units per part and flags the gradient', () => {
    const original = loadSheet(templateSvg(), 'template.svg');
    const { doc, warnings } = importSheet(original);
    expect(doc.name).toBe('template');
    const again = loadSheet(serialize(doc), 'template.svg');
    for (const p of PART_IDS) {
      const a = shapesBBox(original.parts[p]!)!, b = shapesBBox(again.parts[p]!)!;
      for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(a[k] - b[k]), `${p}.${k}`).toBeLessThan(0.5);
    }
    expect(warnings).toContainEqual({ part: 'head', message: 'gradient flattened to its first colour' });
  });
  it('warns about dashes and holes', () => {
    const s = loadSheet(readFileSync(resolve(process.cwd(), 'tests/fixtures/features.svg'), 'utf8'), 'features.svg');
    const { warnings } = importSheet(s);
    expect(warnings).toContainEqual({ part: 'head', message: 'dashes removed' });
    expect(warnings).toContainEqual({ part: 'head', message: 'shape with holes may fill its holes' });
  });
  it('import with missing parts gives empty parts', () => {
    const s = loadSheet('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g id="head"><circle cx="192" cy="182" r="50"/></g></svg>', 'x.svg');
    const { doc } = importSheet(s);
    expect(doc.parts.head).toHaveLength(1);
    for (const p of PART_IDS.filter((x) => x !== 'head')) expect(doc.parts[p]).toEqual([]);
  });
});
