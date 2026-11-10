import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSheet, sheetName, SheetError } from '../../src/sheet/load';
import { shapesBBox } from '../../src/svg/convert';
import type { PartId } from '../../src/sheet/layout';

const fx = (n: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', n), 'utf8');
const msgs = (s: ReturnType<typeof loadSheet>, part?: PartId) =>
  s.warnings.filter((w) => (part ? w.part === part : true)).map((w) => w.message).join(' | ');
const svg = (attrs: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('loadSheet errors', () => {
  it('rejects non-XML', () => expect(() => loadSheet('not svg <', 'x.svg')).toThrow(SheetError));
  it('rejects a non-svg root', () => expect(() => loadSheet('<html/>', 'x.svg')).toThrow(/root element/));
  it('rejects a non-square viewBox', () =>
    expect(() => loadSheet(svg('viewBox="0 0 1024 768"', '<g id="head"/>'), 'x.svg')).toThrow(/square.*1024 × 768/));
  it('rejects a missing viewBox with non-px size', () =>
    expect(() => loadSheet(svg('width="10cm" height="10cm"', '<g id="head"/>'), 'x.svg')).toThrow(/viewBox/));
  it('rejects a sheet with no part layers', () =>
    expect(() => loadSheet(svg('viewBox="0 0 10 10"', '<g id="foo"><rect width="1" height="1"/></g>'), 'x.svg')).toThrow(/No part layers/));
});

describe('loadSheet', () => {
  const head = '<g id="head"><circle cx="192" cy="182" r="100" fill="red"/></g>';
  it('maps a scaled viewBox with an offset origin to reference units', () => {
    const body = '<g id="head"><circle cx="484" cy="464" r="200" fill="red"/></g>';
    const s = loadSheet(svg('viewBox="100 100 2048 2048"', body), 'Big Sheet.svg');
    const b = shapesBBox(s.parts.head!)!;
    expect(b.x0).toBeCloseTo(92); expect(b.y0).toBeCloseTo(82);
    expect(b.x1).toBeCloseTo(292); expect(b.y1).toBeCloseTo(282);
    expect(s.name).toBe('big-sheet');
  });
  it('uses width/height when there is no viewBox', () => {
    const s = loadSheet(svg('width="1024px" height="1024"', head), 'a.svg');
    expect(s.parts.head).not.toBeNull();
  });
  it('reports missing and empty parts', () => {
    const s = loadSheet(svg('viewBox="0 0 1024 1024"', head + '<g id="torso"/>'), 'a.svg');
    expect(msgs(s, 'torso')).toMatch(/empty/);
    expect(msgs(s, 'hand_L')).toMatch(/missing/);
    expect(s.parts.torso).toBeNull();
  });
  it('warns when a part is drawn outside its box', () => {
    const s = loadSheet(svg('viewBox="0 0 1024 1024"', '<g id="head"><circle cx="600" cy="600" r="50"/></g>'), 'a.svg');
    expect(msgs(s, 'head')).toMatch(/outside its box/);
  });
  it('leaves nested part groups out of the outer part', () => {
    const s = loadSheet(svg('viewBox="0 0 1024 1024"',
      '<g id="head"><circle cx="192" cy="182" r="100"/><g id="mouth_open"><circle cx="792" cy="536" r="20"/></g></g>'), 'a.svg');
    expect(s.parts.head).toHaveLength(1);
    expect(s.parts.mouth_open).toHaveLength(1);
  });
  it('warns about scripts and handlers without running them', () => {
    const s = loadSheet(fx('unsupported.svg'), 'unsupported.svg');
    const all = msgs(s);
    for (const re of [/Scripts ignored/, /Event handler/, /Clip path/, /Mask/, /Filter/, /pattern paint/, /image/i, /Text/, /foreignObject/, /length unit/, /External reference/]) {
      expect(all).toMatch(re);
    }
    expect((globalThis as Record<string, unknown>).__crPwned).toBeUndefined();
  });
});

describe('fixtures', () => {
  it('figma: ids, _2 duplicates, frame clip is silent, typo is flagged', () => {
    const s = loadSheet(fx('figma.svg'), 'figma.svg');
    expect(s.parts.head).not.toBeNull();
    expect(s.parts.torso).not.toBeNull();
    expect(s.parts.mouth_open).not.toBeNull();
    expect(s.parts.upper_arm_L).not.toBeNull();
    const all = msgs(s);
    expect(all).toMatch(/Did you mean mouth_half/);
    expect(all).not.toMatch(/Clip path/);
    expect(all).toMatch(/element\(s\) outside every part layer/);
  });
  it('illustrator: classes, _1_ and _x5F_ ids, data-name, xlink gradients, 2048 viewBox', () => {
    const s = loadSheet(fx('illustrator.svg'), 'illustrator.svg');
    for (const p of ['torso', 'eyes_open', 'hand_R', 'brows'] as PartId[]) expect(s.parts[p], p).not.toBeNull();
    for (const p of ['torso', 'eyes_open', 'hand_R', 'brows'] as PartId[]) expect(msgs(s, p), p).not.toMatch(/outside|Unrecognised/);
  });
  it('inkscape: labels, mm viewBox, nested transforms', () => {
    const s = loadSheet(fx('inkscape.svg'), 'inkscape.svg');
    for (const p of ['head', 'eyes_closed', 'mouth_wide'] as PartId[]) {
      expect(s.parts[p], p).not.toBeNull();
      expect(msgs(s, p), p).not.toMatch(/outside/);
    }
  });
  it('affinity: serif:id and matrix transforms', () => {
    const s = loadSheet(fx('affinity.svg'), 'affinity.svg');
    expect(s.parts.forearm_L).not.toBeNull();
    expect(s.parts.forearm_R).not.toBeNull();
  });
  it('features: everything converts with no feature warnings', () => {
    const s = loadSheet(fx('features.svg'), 'features.svg');
    for (const p of ['head', 'torso', 'eyes_open', 'hand_L', 'mouth_closed'] as PartId[]) {
      expect(s.parts[p], p).not.toBeNull();
      expect(msgs(s, p), p).toBe('');
    }
  });
  it('sheetName', () => expect(sheetName('C:\\art\\My Hero_v2.SVG')).toBe('my-hero-v2'));
});
