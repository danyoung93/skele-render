/** Template layout: areas and pivots in reference units (spec 3.2). */
export type Vec2 = [number, number];

export const PART_IDS = [
  'head', 'torso',
  'eyes_open', 'eyes_closed', 'brows',
  'mouth_closed', 'mouth_half', 'mouth_open', 'mouth_wide',
  'upper_arm_L', 'forearm_L', 'hand_L',
  'upper_arm_R', 'forearm_R', 'hand_R',
] as const;
export type PartId = (typeof PART_IDS)[number];

export interface Area { x: number; y: number; w: number; h: number; pivot: Vec2 }

export const REF_SIZE = 1024;
/** Lottie layer scale (%) applied to parts: 1 reference unit = 0.5 px. */
export const PART_SCALE = 50;
export const MIN_GAP = 32;
/** Bottom strip reserved for the legend. */
export const LEGEND_Y = 832;

export const AREAS: Record<PartId, Area> = {
  head:         { x: 32,  y: 32,  w: 320, h: 320, pivot: [160, 300] },
  torso:        { x: 384, y: 32,  w: 320, h: 416, pivot: [160, 416] },
  eyes_open:    { x: 736, y: 32,  w: 256, h: 96,  pivot: [128, 48] },
  eyes_closed:  { x: 736, y: 160, w: 256, h: 96,  pivot: [128, 48] },
  brows:        { x: 736, y: 288, w: 256, h: 64,  pivot: [128, 32] },
  mouth_closed: { x: 736, y: 384, w: 112, h: 80,  pivot: [56, 40] },
  mouth_half:   { x: 880, y: 384, w: 112, h: 80,  pivot: [56, 40] },
  mouth_open:   { x: 736, y: 496, w: 112, h: 80,  pivot: [56, 40] },
  mouth_wide:   { x: 880, y: 496, w: 112, h: 80,  pivot: [56, 40] },
  upper_arm_L:  { x: 32,  y: 608, w: 96,  h: 192, pivot: [48, 24] },
  forearm_L:    { x: 160, y: 608, w: 80,  h: 176, pivot: [40, 20] },
  hand_L:       { x: 272, y: 608, w: 112, h: 112, pivot: [56, 16] },
  upper_arm_R:  { x: 512, y: 608, w: 96,  h: 192, pivot: [48, 24] },
  forearm_R:    { x: 640, y: 608, w: 80,  h: 176, pivot: [40, 20] },
  hand_R:       { x: 752, y: 608, w: 112, h: 112, pivot: [56, 16] },
};

export function isPartId(s: string): s is PartId {
  return (PART_IDS as readonly string[]).includes(s);
}
