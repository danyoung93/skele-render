/** Animation data model (spec 5.1). */
import type { PartId, Vec2 } from '../sheet/layout';
import type { BoneId } from '../rig/rig';

/** Bézier handles in Lottie form: `o` = out-handle of this key, `i` = in-handle of the next key. */
export interface Easing { o: Vec2; i: Vec2 }
export interface Key<T> { frame: number; value: T; ease?: Easing }
export interface BoneTrack {
  rotation?: Key<number>[];
  position?: Key<Vec2>[];
  scale?: Key<Vec2>[];
}
export interface SwapKey { frame: number; sprite: PartId }
export type AnimationId = 'idle' | 'talking' | 'listening';
export interface Animation {
  id: AnimationId;
  label: string;
  frames: number;
  bones: Partial<Record<BoneId, BoneTrack>>;
  swaps: { eyes: SwapKey[]; mouth: SwapKey[] };
}

export const EASE_IN_OUT: Easing = { o: [0.33, 0], i: [0.67, 1] };

/** Shorthand: k(frame, value) */
export const k = <T>(frame: number, value: T, ease?: Easing): Key<T> => (ease ? { frame, value, ease } : { frame, value });
