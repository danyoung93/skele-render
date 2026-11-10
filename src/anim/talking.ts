import type { PartId } from '../sheet/layout';
import { k, type Animation, type SwapKey } from './types';

// Irregular mouth pattern, changing every 3–5 frames.
const MOUTH: [number, PartId][] = [
  [0, 'mouth_closed'], [3, 'mouth_half'], [7, 'mouth_open'], [11, 'mouth_half'], [14, 'mouth_wide'],
  [18, 'mouth_open'], [21, 'mouth_closed'], [24, 'mouth_half'], [28, 'mouth_open'], [31, 'mouth_wide'],
  [35, 'mouth_half'], [38, 'mouth_closed'], [42, 'mouth_open'], [46, 'mouth_half'], [49, 'mouth_wide'],
  [53, 'mouth_half'], [57, 'mouth_closed'],
];

export const talking: Animation = {
  id: 'talking',
  label: 'Talking',
  frames: 60,
  bones: {
    torso: { rotation: [k(0, 0), k(30, 1), k(60, 0)] },
    head: {
      position: [k(0, [0, 0]), k(15, [0, -3]), k(30, [0, 2]), k(45, [0, -3]), k(60, [0, 0])],
      rotation: [k(0, 0), k(20, 4), k(40, -4), k(60, 0)],
    },
    brows: { position: [k(0, [0, 0]), k(10, [0, -6]), k(18, [0, 0]), k(38, [0, -6]), k(46, [0, 0]), k(60, [0, 0])] },
    elbow_R: { rotation: [k(0, 0), k(15, 25), k(40, 25), k(55, 0), k(60, 0)] },
    wrist_R: { rotation: [k(0, 0), k(15, -10), k(28, 5), k(40, -10), k(55, 0), k(60, 0)] },
    shoulder_L: { rotation: [k(0, 0), k(30, 1.5), k(60, 0)] },
  },
  swaps: {
    eyes: [{ frame: 0, sprite: 'eyes_open' }, { frame: 40, sprite: 'eyes_closed' }, { frame: 43, sprite: 'eyes_open' }],
    mouth: MOUTH.map(([frame, sprite]): SwapKey => ({ frame, sprite })),
  },
};
