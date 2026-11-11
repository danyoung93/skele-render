import { describe, it, expect } from 'vitest';
import { buildLottie, buildPartPreview } from '../../src/lottie/build';
import { ANIMATIONS } from '../../src/anim';
import { loadSheet } from '../../src/sheet/load';
import { templateSvg } from '../../src/sheet/template';
import { BONES, SWAP_GROUPS, COMP_SIZE } from '../../src/rig/rig';
import { AREAS, PART_IDS, type PartId } from '../../src/sheet/layout';
import type { Layer, LottieDoc, ShapeItem, ShapeLayer } from '../../src/lottie/types';
import { jointPosition, valueAt, worldMatrix } from './pose';
import { apply } from '../../src/svg/matrix';

const sheet = loadSheet(templateSvg(), 'template.svg');
const ALLOWED_ITEMS = new Set(['gr', 'sh', 'fl', 'st', 'gf', 'gs', 'tr']);

function itemTypes(items: ShapeItem[], out = new Set<string>()) {
  for (const i of items) { out.add(i.ty); if (i.ty === 'gr') itemTypes(i.it, out); }
  return out;
}
const shapeLayers = (d: LottieDoc) => d.layers.filter((l): l is ShapeLayer => l.ty === 4);

describe.each(ANIMATIONS.map((a) => [a.id, a] as const))('buildLottie %s', (_, anim) => {
  const doc = buildLottie(sheet, anim, { debug: false });
  const dbg = buildLottie(sheet, anim, { debug: true });

  it('has the document header from the spec', () => {
    expect(doc).toMatchObject({ v: '5.7.0', fr: 30, ip: 0, op: anim.frames, w: 512, h: 512, assets: [] });
  });
  it('has unique inds and resolvable parents', () => {
    for (const d of [doc, dbg]) {
      const inds = d.layers.map((l) => l.ind);
      expect(new Set(inds).size).toBe(inds.length);
      for (const l of d.layers) if (l.parent !== undefined) expect(inds).toContain(l.parent);
    }
  });
  it('has one null per bone and one shape layer per part, in front-to-back order', () => {
    expect(doc.layers.filter((l) => l.ty === 3)).toHaveLength(BONES.length);
    const names = shapeLayers(doc).map((l) => l.nm);
    expect(names).toHaveLength(PART_IDS.length);
    expect(names[0]).toBe('mouth_wide');
    expect(names[names.length - 1]).toBe('torso');
    const firstNull = doc.layers.findIndex((l) => l.ty === 3);
    expect(doc.layers.slice(firstNull).every((l) => l.ty === 3)).toBe(true);
  });
  it('puts each forearm layer in front of its hand layer (Lottie draws the first layer on top)', () => {
    const names = shapeLayers(doc).map((l) => l.nm);
    for (const side of ['L', 'R']) expect(names.indexOf(`forearm_${side}`)).toBeLessThan(names.indexOf(`hand_${side}`));
  });
  it('uses only allowed layer and item types', () => {
    for (const l of doc.layers) {
      expect([3, 4]).toContain(l.ty);
      if (l.ty === 4) for (const t of itemTypes(l.shapes)) expect(ALLOWED_ITEMS).toContain(t);
    }
  });
  it('shows exactly one member of each swap group on every frame', () => {
    for (const members of Object.values(SWAP_GROUPS)) {
      const layers = shapeLayers(doc).filter((l) => members.includes(l.nm as PartId));
      for (let f = 0; f < anim.frames; f++) {
        const visible = layers.filter((l) => valueAt(l.ks.o, f)[0] !== 0);
        expect(visible, `frame ${f}`).toHaveLength(1);
      }
    }
  });
  it('adds debug layers only when asked, in front', () => {
    expect(doc.layers.some((l) => l.nm.startsWith('debug:'))).toBe(false);
    const d = dbg.layers.filter((l) => l.nm.startsWith('debug:'));
    expect(d).toHaveLength(BONES.length);
    expect(dbg.layers.slice(0, BONES.length).every((l) => l.nm.startsWith('debug:'))).toBe(true);
  });
  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe('partial sheets', () => {
  it('builds with only some parts, keeping every bone', () => {
    const parts = Object.fromEntries(PART_IDS.map((p) => [p, p === 'head' ? sheet.parts.head : null])) as Record<PartId, ShapeItem[] | null>;
    const doc = buildLottie({ parts }, ANIMATIONS[1], { debug: false });
    expect(shapeLayers(doc).map((l) => l.nm)).toEqual(['head']);
    expect(doc.layers.filter((l) => l.ty === 3)).toHaveLength(BONES.length);
  });
});

describe('pose sanity at frame 0', () => {
  const doc = buildLottie(sheet, ANIMATIONS[0], { debug: false });
  const J = (b: string) => jointPosition(doc, `bone:${b}`);
  it('arms hang down, L is left of R, head above root, all joints inside the comp', () => {
    for (const s of ['L', 'R']) {
      expect(J(`wrist_${s}`)[1]).toBeGreaterThan(J(`elbow_${s}`)[1]);
      expect(J(`elbow_${s}`)[1]).toBeGreaterThan(J(`shoulder_${s}`)[1]);
    }
    expect(J('shoulder_L')[0]).toBeLessThan(J('shoulder_R')[0]);
    expect(J('head')[1]).toBeLessThan(J('root')[1]);
    for (const b of BONES) {
      const [x, y] = J(b.id);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(COMP_SIZE);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(COMP_SIZE);
    }
  });
  it('puts each part pivot on its joint', () => {
    const head = doc.layers.find((l) => l.nm === 'head') as Layer;
    const a = AREAS.head;
    const p = apply(worldMatrix(doc, head), [a.x + a.pivot[0], a.y + a.pivot[1]]);
    expect(p[0]).toBeCloseTo(J('head')[0]);
    expect(p[1]).toBeCloseTo(J('head')[1]);
  });
});

describe('buildPartPreview', () => {
  it('frames one part at 100%', () => {
    const d = buildPartPreview(sheet.parts.head!, AREAS.head);
    expect(d).toMatchObject({ w: 320, h: 320, op: 1 });
    expect(d.layers).toHaveLength(1);
  });
});

describe('output independence', () => {
  it('shares no objects with the sheet, so players that mutate data (lottie-web) cannot corrupt later builds', () => {
    const before = JSON.stringify(sheet.parts);
    const doc = buildLottie(sheet, ANIMATIONS[0], { debug: false });
    const head = shapeLayers(doc).find((l) => l.nm === 'head')!;
    // Simulate lottie-web converting tangents to absolute in place.
    const walk = (items: ShapeItem[]) => items.forEach((i) => {
      if (i.ty === 'gr') walk(i.it);
      if (i.ty === 'sh') i.ks.k.i = i.ks.k.i.map(([x, y]) => [x + 1000, y + 1000]);
    });
    walk(head.shapes);
    expect(JSON.stringify(sheet.parts)).toBe(before);
  });
});
