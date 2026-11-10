import { describe, it, expect } from 'vitest';
import { templateSvg } from '../../src/sheet/template';
import { loadSheet } from '../../src/sheet/load';
import { AREAS, PART_IDS } from '../../src/sheet/layout';
import { shapesBBox } from '../../src/svg/convert';

describe('template', () => {
  const text = templateSvg();
  it('parses and has one layer per part plus guides', () => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    for (const id of [...PART_IDS, 'guides']) expect(doc.getElementById(id), id).not.toBeNull();
  });
  it('loads with no warnings, every part non-empty and inside its box', () => {
    const s = loadSheet(text, 'template.svg');
    expect(s.warnings).toEqual([]);
    expect(s.name).toBe('template');
    for (const id of PART_IDS) {
      const shapes = s.parts[id];
      expect(shapes?.length, id).toBeGreaterThan(0);
      const b = shapesBBox(shapes!)!, a = AREAS[id];
      expect(b.x0, id).toBeGreaterThanOrEqual(a.x);
      expect(b.y0, id).toBeGreaterThanOrEqual(a.y);
      expect(b.x1, id).toBeLessThanOrEqual(a.x + a.w);
      expect(b.y1, id).toBeLessThanOrEqual(a.y + a.h);
    }
  });
});
