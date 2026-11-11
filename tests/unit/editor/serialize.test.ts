import { describe, it, expect } from 'vitest';
import { serialize } from '../../../src/editor/serialize';
import { loadSheet } from '../../../src/sheet/load';
import { PART_IDS, type PartId } from '../../../src/sheet/layout';
import type { Fill, Group, ShapeItem, Stroke } from '../../../src/lottie/types';
import { fixtureDoc } from './fixture-doc';

type B = { x0: number; y0: number; x1: number; y1: number };
/** Exact bbox of the converted curves, by sampling every cubic segment. */
function curveBBox(items: ShapeItem[]): B {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
  const walk = (its: ShapeItem[]) => its.forEach((it) => {
    if (it.ty === 'gr') walk(it.it);
    if (it.ty !== 'sh') return;
    const { v, i, o, c } = it.ks.k;
    const n = v.length, segs = c ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const p0 = v[k], p3 = v[(k + 1) % n];
      const p1 = [p0[0] + o[k][0], p0[1] + o[k][1]], p2 = [p3[0] + i[(k + 1) % n][0], p3[1] + i[(k + 1) % n][1]];
      for (let t = 0; t <= 1; t += 1 / 256) {
        const u = 1 - t;
        add(u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
          u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]);
      }
    }
  });
  walk(items);
  return b;
}
const closeBox = (a: B, b: B, eps: number) => (['x0', 'y0', 'x1', 'y1'] as const).forEach((k) => expect(Math.abs(a[k] - b[k]), k).toBeLessThan(eps));
const paint = (items: ShapeItem[]) => {
  const g = items[0] as Group;
  return { fl: g.it.find((x) => x.ty === 'fl') as Fill | undefined, st: g.it.find((x) => x.ty === 'st') as Stroke | undefined };
};

describe('serialize', () => {
  const doc = fixtureDoc();
  const text = serialize(doc);
  const sheet = loadSheet(text, 'test-character.svg');
  const used: PartId[] = ['head', 'torso', 'hand_L', 'mouth_open', 'mouth_closed'];

  it('writes template layers and the character name', () => {
    expect(text).toContain('data-character-name="test-character"');
    for (const p of PART_IDS) expect(text).toContain(`<g id="${p}" inkscape:groupmode="layer"`);
    expect(text).toContain('<g id="guides"');
  });
  it('loads with only "empty" warnings for the unused parts', () => {
    const unexpected = sheet.warnings.filter((w) => !(w.part && !used.includes(w.part) && /empty/.test(w.message)));
    expect(unexpected).toEqual([]);
    expect(sheet.warnings).toHaveLength(PART_IDS.length - used.length);
  });
  it('keeps geometry: rotated ellipse', () => {
    const a = (20 * Math.PI) / 180, hx = Math.hypot(120 * Math.cos(a), 90 * Math.sin(a)), hy = Math.hypot(120 * Math.sin(a), 90 * Math.cos(a));
    closeBox(curveBBox(sheet.parts.head!), { x0: 192 - hx, y0: 182 - hy, x1: 192 + hx, y1: 182 + hy }, 0.05);
  });
  it('keeps geometry: rounded rect, rotated rect, paths', () => {
    closeBox(curveBBox(sheet.parts.torso!), { x0: 420, y0: 80, x1: 660, y1: 380 }, 0.01);
    const d = (25 + 20) / Math.SQRT2; // rotated -45: half-extent = (w/2+h/2)/√2
    closeBox(curveBBox(sheet.parts.hand_L!), { x0: 325 - d, y0: 660 - d, x1: 325 + d, y1: 660 + d }, 0.01);
    const mo = curveBBox(sheet.parts.mouth_open!);
    expect(mo.x0).toBeCloseTo(764, 1); expect(mo.y0).toBeCloseTo(522, 1); expect(mo.y1).toBeCloseTo(562, 1);
  });
  it('keeps colours and opacities', () => {
    const head = paint(sheet.parts.head!);
    expect(head.fl!.c.k).toEqual([0.9569, 0.7255, 0.6275, 1]);
    expect(head.st!.o.k).toBe(80);
    expect(head.st!.w.k).toBe(6);
    expect(paint(sheet.parts.torso!).fl!.o.k).toBe(50);
    const mc = paint(sheet.parts.mouth_closed!);
    expect(mc.fl).toBeUndefined();
    expect(mc.st!.lc).toBe(2);
    expect(mc.st!.lj).toBe(2);
  });
});
