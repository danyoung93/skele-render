import { k, type Animation } from './types';

export const idle: Animation = {
  id: 'idle',
  label: 'Idle',
  frames: 120,
  bones: {
    torso: { scale: [k(0, [100, 100]), k(60, [100, 101.5]), k(120, [100, 100])] },
    head: { rotation: [k(0, 0), k(30, 2), k(90, -2), k(120, 0)] },
    shoulder_L: { rotation: [k(0, 0), k(60, 2), k(120, 0)] },
    shoulder_R: { rotation: [k(0, 0), k(30, 2), k(90, -2), k(120, 0)] },
    elbow_L: { rotation: [k(0, 0), k(60, 3), k(120, 0)] },
    elbow_R: { rotation: [k(0, 0), k(60, -3), k(120, 0)] },
  },
  swaps: {
    eyes: [{ frame: 0, sprite: 'eyes_open' }, { frame: 68, sprite: 'eyes_closed' }, { frame: 72, sprite: 'eyes_open' }],
    mouth: [{ frame: 0, sprite: 'mouth_closed' }],
  },
};
