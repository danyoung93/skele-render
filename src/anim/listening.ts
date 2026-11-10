import { k, type Animation } from './types';

export const listening: Animation = {
  id: 'listening',
  label: 'Listening',
  frames: 90,
  bones: {
    torso: { rotation: [k(0, 0), k(45, 1.5), k(90, 0)] },
    head: {
      rotation: [k(0, 0), k(20, 0), k(35, 6), k(50, 0), k(90, 0)],
      position: [k(0, [0, 0]), k(20, [0, 0]), k(35, [0, 4]), k(50, [0, 0]), k(90, [0, 0])],
    },
    brows: { position: [k(0, [0, 0]), k(25, [0, -4]), k(50, [0, 0]), k(90, [0, 0])] },
  },
  swaps: {
    eyes: [{ frame: 0, sprite: 'eyes_open' }, { frame: 60, sprite: 'eyes_closed' }, { frame: 64, sprite: 'eyes_open' }],
    mouth: [{ frame: 0, sprite: 'mouth_closed' }],
  },
};
