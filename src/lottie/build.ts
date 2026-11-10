/** Lottie document assembly (spec 7). Pure. */
import type { Animation, Key } from '../anim/types';
import { EASE_IN_OUT } from '../anim/types';
import { ATTACH, BONES, COMP_SIZE, DRAW_ORDER, FPS, swapGroupOf, type BoneId } from '../rig/rig';
import { AREAS, PART_SCALE, type Area, type PartId } from '../sheet/layout';
import { ellipse, toLottiePath } from '../svg/geometry';
import type { Keyframe, Layer, LayerTransform, LottieDoc, Prop, ShapeItem, ShapeLayer } from './types';
import { identityTr, stat } from './types';

export interface SheetParts {
  name?: string;
  parts: Record<PartId, ShapeItem[] | null>;
}

const BONE_IND = (id: BoneId) => 1 + BONES.findIndex((b) => b.id === id);
const PART_IND = (p: PartId) => 100 + DRAW_ORDER.indexOf(p);
const DEBUG_IND = (id: BoneId) => 200 + BONES.findIndex((b) => b.id === id);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Keyframed or static property from a track; `base` is added to (or multiplied for scale) each value. */
function trackProp(keys: Key<number[]>[] | undefined, base: number[]): Prop<number[]> {
  if (!keys || !keys.length) return stat(base);
  const dims = base.length;
  const k: Keyframe[] = keys.map((key, i) => {
    const s = key.value.map((v, d) => r3(v + base[d]));
    if (i === keys.length - 1) return { t: key.frame, s };
    const e = key.ease ?? EASE_IN_OUT;
    return {
      t: key.frame, s,
      o: { x: Array(dims).fill(e.o[0]), y: Array(dims).fill(e.o[1]) },
      i: { x: Array(dims).fill(e.i[0]), y: Array(dims).fill(e.i[1]) },
    };
  });
  return { a: 1, k };
}

function scalarProp(p: Prop<number[]>): Prop<number> {
  if (p.a === 0) return stat(p.k[0]);
  return p as unknown as Prop<number>;
}

function base(op: number) {
  return { ddd: 0 as const, ip: 0, op, st: 0, sr: 1 as const, ao: 0 as const, bm: 0 as const };
}

function boneLayers(anim: Animation): Layer[] {
  return BONES.map((b) => {
    const tr = anim.bones[b.id] ?? {};
    const ks: LayerTransform = {
      a: stat([0, 0, 0]),
      p: trackProp(tr.position, [...b.offset]),
      r: scalarProp(trackProp(tr.rotation?.map((x) => ({ ...x, value: [x.value] })), [b.rotation])),
      s: trackProp(tr.scale?.map((x) => ({ ...x, value: [x.value[0] - 100, x.value[1] - 100] })), [100, 100]),
      o: stat(100),
    };
    const layer: Layer = { ...base(anim.frames), ty: 3, ind: BONE_IND(b.id), nm: `bone:${b.id}`, ks };
    if (b.parent) layer.parent = BONE_IND(b.parent);
    return layer;
  });
}

/** Hold keyframes (0/100) making `part` visible only while it is the active member of its swap group. */
function swapOpacity(part: PartId, anim: Animation): Prop<number> {
  const g = swapGroupOf(part);
  if (!g) return stat(100);
  const keys = anim.swaps[g];
  const k: Keyframe[] = [];
  for (const key of keys) {
    const s = key.sprite === part ? 100 : 0;
    if (k.length && k[k.length - 1].s[0] === s) continue;
    k.push({ t: key.frame, s: [s], h: 1 });
  }
  if (k.length === 1) return stat(k[0].s[0]);
  return { a: 1, k };
}

function partLayer(part: PartId, shapes: ShapeItem[], anim: Animation): ShapeLayer {
  const area = AREAS[part], at = ATTACH[part];
  return {
    ...base(anim.frames), ty: 4, ind: PART_IND(part), nm: part, parent: BONE_IND(at.bone),
    ks: {
      a: stat([area.x + area.pivot[0], area.y + area.pivot[1], 0]),
      p: stat([...at.offset, 0]),
      s: stat([PART_SCALE, PART_SCALE, 100]),
      r: stat(0),
      o: swapOpacity(part, anim),
    },
    shapes,
  };
}

const DEBUG_COLOR = [0.88, 0.27, 0.48, 1];

function debugLayers(anim: Animation): ShapeLayer[] {
  return BONES.map((b) => {
    const children = BONES.filter((c) => c.parent === b.id);
    const dot = { ty: 'gr' as const, nm: 'joint', it: [
      { ty: 'sh' as const, ks: stat(toLottiePath(ellipse(0, 0, 3, 3))) },
      { ty: 'st' as const, c: stat([1, 1, 1, 1]), o: stat(100), w: stat(1.5), lc: 2 as const, lj: 2 as const, ml: 4 },
      { ty: 'fl' as const, c: stat(DEBUG_COLOR), o: stat(100), r: 1 as const },
      identityTr(),
    ] };
    const lines = children.map((c) => ({ ty: 'gr' as const, nm: `to ${c.id}`, it: [
      { ty: 'sh' as const, ks: stat({ c: false, v: [[0, 0], [...c.offset]] as [number, number][], i: [[0, 0], [0, 0]] as [number, number][], o: [[0, 0], [0, 0]] as [number, number][] }) },
      { ty: 'st' as const, c: stat(DEBUG_COLOR), o: stat(80), w: stat(2), lc: 2 as const, lj: 2 as const, ml: 4 },
      identityTr(),
    ] }));
    return {
      ...base(anim.frames), ty: 4 as const, ind: DEBUG_IND(b.id), nm: `debug:${b.id}`, parent: BONE_IND(b.id),
      ks: { a: stat([0, 0, 0]), p: stat([0, 0, 0]), s: stat([100, 100, 100]), r: stat(0), o: stat(100) },
      shapes: [dot, ...lines],
    };
  });
}

export function buildLottie(sheet: SheetParts, anim: Animation, opts: { debug: boolean }): LottieDoc {
  const parts: ShapeLayer[] = [];
  for (const p of [...DRAW_ORDER].reverse()) {
    const shapes = sheet.parts[p];
    if (shapes && shapes.length) parts.push(partLayer(p, shapes, anim));
  }
  return {
    v: '5.7.0', fr: FPS, ip: 0, op: anim.frames, w: COMP_SIZE, h: COMP_SIZE,
    nm: `${sheet.name ?? 'character'}-${anim.id}`, ddd: 0, assets: [],
    layers: [...(opts.debug ? debugLayers(anim) : []), ...parts, ...boneLayers(anim)],
  };
}

/** One part, unscaled, framed to its area (used by the visual-match test). */
export function buildPartPreview(shapes: ShapeItem[], area: Area): LottieDoc {
  return {
    v: '5.7.0', fr: FPS, ip: 0, op: 1, w: area.w, h: area.h, nm: 'part', ddd: 0, assets: [],
    layers: [{
      ...base(1), ty: 4, ind: 1, nm: 'part',
      ks: { a: stat([area.x, area.y, 0]), p: stat([0, 0, 0]), s: stat([100, 100, 100]), r: stat(0), o: stat(100) },
      shapes,
    }],
  };
}

