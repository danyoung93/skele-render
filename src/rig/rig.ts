/** Built-in skeleton (spec 4). Composition px, y down, degrees clockwise. */
import type { PartId, Vec2 } from '../sheet/layout';

export const COMP_SIZE = 512;
export const FPS = 30;

export const BONE_IDS = [
  'root', 'torso', 'neck', 'head', 'brows',
  'shoulder_L', 'elbow_L', 'wrist_L',
  'shoulder_R', 'elbow_R', 'wrist_R',
] as const;
export type BoneId = (typeof BONE_IDS)[number];

export interface Bone { id: BoneId; parent: BoneId | null; offset: Vec2; rotation: number }

export const BONES: Bone[] = [
  { id: 'root',       parent: null,         offset: [256, 440], rotation: 0 },
  { id: 'torso',      parent: 'root',       offset: [0, 0],     rotation: 0 },
  { id: 'neck',       parent: 'torso',      offset: [0, -200],  rotation: 0 },
  { id: 'head',       parent: 'neck',       offset: [0, 0],     rotation: 0 },
  { id: 'brows',      parent: 'head',       offset: [0, -108],  rotation: 0 },
  { id: 'shoulder_L', parent: 'torso',      offset: [-72, -180], rotation: 10 },
  { id: 'elbow_L',    parent: 'shoulder_L', offset: [0, 84],    rotation: 0 },
  { id: 'wrist_L',    parent: 'elbow_L',    offset: [0, 76],    rotation: 0 },
  { id: 'shoulder_R', parent: 'torso',      offset: [72, -180], rotation: -10 },
  { id: 'elbow_R',    parent: 'shoulder_R', offset: [0, 84],    rotation: 0 },
  { id: 'wrist_R',    parent: 'elbow_R',    offset: [0, 76],    rotation: 0 },
];

export const ATTACH: Record<PartId, { bone: BoneId; offset: Vec2 }> = {
  torso:        { bone: 'torso', offset: [0, 0] },
  head:         { bone: 'head', offset: [0, 0] },
  eyes_open:    { bone: 'head', offset: [0, -85] },
  eyes_closed:  { bone: 'head', offset: [0, -85] },
  brows:        { bone: 'brows', offset: [0, 0] },
  mouth_closed: { bone: 'head', offset: [0, -40] },
  mouth_half:   { bone: 'head', offset: [0, -40] },
  mouth_open:   { bone: 'head', offset: [0, -40] },
  mouth_wide:   { bone: 'head', offset: [0, -40] },
  upper_arm_L:  { bone: 'shoulder_L', offset: [0, 0] },
  forearm_L:    { bone: 'elbow_L', offset: [0, 0] },
  hand_L:       { bone: 'wrist_L', offset: [0, 0] },
  upper_arm_R:  { bone: 'shoulder_R', offset: [0, 0] },
  forearm_R:    { bone: 'elbow_R', offset: [0, 0] },
  hand_R:       { bone: 'wrist_R', offset: [0, 0] },
};

/** Back to front. */
export const DRAW_ORDER: PartId[] = [
  // Hands sit under their forearms so the sleeve end covers the wrist.
  'torso', 'upper_arm_L', 'hand_L', 'forearm_L', 'upper_arm_R', 'hand_R', 'forearm_R',
  'head', 'eyes_open', 'eyes_closed', 'brows',
  'mouth_closed', 'mouth_half', 'mouth_open', 'mouth_wide',
];

export type SwapGroupId = 'eyes' | 'mouth';
export const SWAP_GROUPS: Record<SwapGroupId, PartId[]> = {
  eyes: ['eyes_open', 'eyes_closed'],
  mouth: ['mouth_closed', 'mouth_half', 'mouth_open', 'mouth_wide'],
};
export const SWAP_DEFAULT: Record<SwapGroupId, PartId> = { eyes: 'eyes_open', mouth: 'mouth_closed' };

export function boneById(id: BoneId): Bone {
  const b = BONES.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown bone ${id}`);
  return b;
}

export function swapGroupOf(part: PartId): SwapGroupId | null {
  for (const g of Object.keys(SWAP_GROUPS) as SwapGroupId[]) if (SWAP_GROUPS[g].includes(part)) return g;
  return null;
}
