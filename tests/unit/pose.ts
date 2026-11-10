import type { Layer, LottieDoc, Prop } from '../../src/lottie/types';
import { mul, rotate, scale, translate, apply, type Mat } from '../../src/svg/matrix';

/** Value of a property at `frame` (step evaluation is enough for the tests). Scalars come back as [v]. */
export function valueAt(p: Prop<number | number[]>, frame: number): number[] {
  if (p.a === 0) return [p.k].flat();
  let v = p.k[0].s;
  for (const kf of p.k) if (kf.t <= frame) v = kf.s;
  return v;
}

/** World matrix of a layer at `frame`, chaining parents. */
export function worldMatrix(doc: LottieDoc, layer: Layer, frame = 0): Mat {
  const ks = layer.ks;
  const p = valueAt(ks.p, frame), a = valueAt(ks.a, frame), s = valueAt(ks.s, frame);
  const r = valueAt(ks.r, frame)[0];
  const local = mul(mul(mul(translate(p[0], p[1]), rotate(r)), scale(s[0] / 100, s[1] / 100)), translate(-a[0], -a[1]));
  if (layer.parent === undefined) return local;
  const parent = doc.layers.find((l) => l.ind === layer.parent)!;
  return mul(worldMatrix(doc, parent, frame), local);
}

export function jointPosition(doc: LottieDoc, nm: string, frame = 0) {
  const l = doc.layers.find((x) => x.nm === nm)!;
  return apply(worldMatrix(doc, l, frame), [0, 0]);
}
