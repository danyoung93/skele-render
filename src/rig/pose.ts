/** Rest-pose world matrices for a rig (rig editor spec §2.4). Mirrors the Lottie layer transforms. */
import { AREAS, PART_IDS, PART_SCALE, type PartId } from '../sheet/layout';
import { mul, rotate, scale, translate, IDENTITY, type Mat } from '../svg/matrix';
import type { BoneId } from './rig';
import { rigToSkeleton, type Rig } from './rig-file';

export function restPose(rig: Rig): { bone: Record<BoneId, Mat>; part: Record<PartId, Mat> } {
  const sk = rigToSkeleton(rig);
  const bone = {} as Record<BoneId, Mat>;
  for (const b of sk.bones) {
    const parent = b.parent ? bone[b.parent] : IDENTITY;
    bone[b.id] = mul(mul(parent, translate(b.offset[0], b.offset[1])), rotate(b.rotation));
  }
  const part = {} as Record<PartId, Mat>;
  for (const p of PART_IDS) {
    const a = AREAS[p], at = sk.attach[p], k = PART_SCALE / 100;
    part[p] = mul(mul(mul(bone[at.bone], translate(at.offset[0], at.offset[1])), scale(k)), translate(-(a.x + a.pivot[0]), -(a.y + a.pivot[1])));
  }
  return { bone, part };
}
