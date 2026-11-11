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

const ARM = ['shoulder', 'elbow', 'wrist'] as const;

/** Copies one arm's joints onto the other, mirrored across the vertical line through the root. */
export function mirrorArmsFrom(rig: Rig, from: 'L' | 'R'): Rig {
  const to = from === 'L' ? 'R' : 'L', cx = rig.joints.root[0];
  const joints = { ...rig.joints };
  for (const j of ARM) { const p = rig.joints[`${j}_${from}`]; joints[`${j}_${to}`] = [2 * cx - p[0], p[1]]; }
  return { ...rig, joints };
}

/** moveJoint, then (when mirroring) the moved side's arm is mirrored onto the other side. */
export function moveJointMirrored(rig: Rig, id: JointId, d: Vec2, alone: boolean, mirror: boolean): Rig {
  const moved = moveJoint(rig, id, d, alone);
  if (!mirror) return moved;
  const side = /_(L|R)$/.exec(id)?.[1] as 'L' | 'R' | undefined;
  if (side) return mirrorArmsFrom(moved, side);
  return id === 'root' ? mirrorArmsFrom(moved, 'L') : moved;
}
