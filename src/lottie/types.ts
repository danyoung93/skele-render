/** Minimal Lottie JSON types for the subset this tool emits (spec 7.4). */
export type Vec2 = [number, number];

export interface Static<T> { a: 0; k: T }
export interface Bezier { x: number[]; y: number[] }
export interface Keyframe { t: number; s: number[]; h?: 1; i?: Bezier; o?: Bezier }
export interface Animated { a: 1; k: Keyframe[] }
export type Prop<T> = Static<T> | Animated;

export interface PathData { v: Vec2[]; i: Vec2[]; o: Vec2[]; c: boolean }
export interface PathShape { ty: 'sh'; nm?: string; ks: Static<PathData> }
export interface Fill { ty: 'fl'; nm?: string; c: Static<number[]>; o: Static<number>; r: 1 | 2 }
export interface DashItem { n: 'd' | 'g' | 'o'; nm: string; v: Static<number> }
export interface Stroke {
  ty: 'st'; nm?: string; c: Static<number[]>; o: Static<number>; w: Static<number>;
  lc: 1 | 2 | 3; lj: 1 | 2 | 3; ml: number; d?: DashItem[];
}
export interface GradientCommon {
  t: 1 | 2; s: Static<Vec2>; e: Static<Vec2>; o: Static<number>;
  g: { p: number; k: Static<number[]> };
  h?: Static<number>; a?: Static<number>;
}
export interface GradFill extends GradientCommon { ty: 'gf'; nm?: string; r: 1 | 2 }
export interface GradStroke extends GradientCommon {
  ty: 'gs'; nm?: string; w: Static<number>; lc: 1 | 2 | 3; lj: 1 | 2 | 3; ml: number; d?: DashItem[];
}
export interface TransformItem {
  ty: 'tr'; p: Static<Vec2>; a: Static<Vec2>; s: Static<Vec2>; r: Static<number>;
  o: Static<number>; sk: Static<number>; sa: Static<number>;
}
export interface Group { ty: 'gr'; nm?: string; it: ShapeItem[] }
export type ShapeItem = Group | PathShape | Fill | Stroke | GradFill | GradStroke | TransformItem;

export interface LayerTransform {
  a: Prop<number[]>; p: Prop<number[]>; s: Prop<number[]>; r: Prop<number>; o: Prop<number>;
}
interface LayerBase {
  ddd: 0; ind: number; nm: string; parent?: number; ks: LayerTransform;
  ip: number; op: number; st: number; sr: 1; ao: 0; bm: 0;
}
export interface NullLayer extends LayerBase { ty: 3 }
export interface ShapeLayer extends LayerBase { ty: 4; shapes: ShapeItem[] }
export type Layer = NullLayer | ShapeLayer;

export interface LottieDoc {
  v: string; fr: number; ip: number; op: number; w: number; h: number; nm: string;
  ddd: 0; assets: never[]; layers: Layer[];
}

export const stat = <T>(k: T): Static<T> => ({ a: 0, k });

export function identityTr(): TransformItem {
  return {
    ty: 'tr', p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0),
    o: stat(100), sk: stat(0), sa: stat(0),
  };
}
