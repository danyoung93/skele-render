/** Built-in skeleton (spec 4). Composition px, y down, degrees clockwise. */
import type { PartId, Vec2 } from '../sheet/layout';
import { DEFAULT_RIG, rigToSkeleton } from './rig-file';

export const COMP_SIZE = 512;
/**
 * The exported Lottie's frame within the 512² character space: a 250 × 300 portrait crop so the body
 * runs off the bottom edge. Rigs and sheets stay in character space; only the export is cropped.
 */
export const EXPORT_FRAME = { x: 140, y: 80, w: 250, h: 300 } as const;
export const FPS = 30;

export const BONE_IDS = [
  'root', 'torso', 'neck', 'head', 'brows',
  'shoulder_L', 'elbow_L', 'wrist_L',
  'shoulder_R', 'elbow_R', 'wrist_R',
] as const;
export type BoneId = (typeof BONE_IDS)[number];

export interface Bone { id: BoneId; parent: BoneId | null; offset: Vec2; rotation: number }

/** The default skeleton, derived from the default rig (rig editor spec §2.2). */
export const BONES: Bone[] = rigToSkeleton(DEFAULT_RIG).bones;
export const ATTACH: Record<PartId, { bone: BoneId; offset: Vec2 }> = rigToSkeleton(DEFAULT_RIG).attach;
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
