/** Pure joint edits for the rig editor (rig editor spec §3.2–3.3). */
import type { Vec2 } from '../sheet/layout';
import { JOINT_IDS, type JointId, type Rig } from './rig-file';

/** Joints that move with each joint when it is dragged (without Alt). */
export const DEPENDENTS: Record<JointId, JointId[]> = {
  root: JOINT_IDS.filter((j) => j !== 'root'),
  neck: ['brows', 'eyes', 'mouth'],
  shoulder_L: ['elbow_L', 'wrist_L'], elbow_L: ['wrist_L'], wrist_L: [],
  shoulder_R: ['elbow_R', 'wrist_R'], elbow_R: ['wrist_R'], wrist_R: [],
  brows: [], eyes: [], mouth: [],
};

export function moveJoint(rig: Rig, id: JointId, d: Vec2, alone: boolean): Rig {
  const ids = new Set<JointId>([id, ...(alone ? [] : DEPENDENTS[id])]);
  const joints = { ...rig.joints };
  for (const j of ids) joints[j] = [rig.joints[j][0] + d[0], rig.joints[j][1] + d[1]];
  return { ...rig, joints };
}
