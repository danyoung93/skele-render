import { describe, it, expect } from 'vitest';
import { moveJoint, DEPENDENTS } from '../../../src/rig/rig-edit';
import { DEFAULT_RIG, JOINT_IDS, type JointId, type Rig } from '../../../src/rig/rig-file';

const frozen = (): Rig => JSON.parse(JSON.stringify(DEFAULT_RIG), (_k, v) => (v && typeof v === 'object' ? Object.freeze(v) : v));
function moved(a: Rig, b: Rig): JointId[] {
  return JOINT_IDS.filter((id) => a.joints[id][0] !== b.joints[id][0] || a.joints[id][1] !== b.joints[id][1]);
}

describe('moveJoint', () => {
  it.each([
    ['root', [...JOINT_IDS]],
    ['neck', ['neck', 'brows', 'eyes', 'mouth']],
    ['shoulder_L', ['shoulder_L', 'elbow_L', 'wrist_L']],
    ['elbow_R', ['elbow_R', 'wrist_R']],
    ['wrist_L', ['wrist_L']],
    ['eyes', ['eyes']],
  ] as [JointId, JointId[]][])('%s moves itself and its dependents', (id, expected) => {
    const r = frozen();
    const out = moveJoint(r, id, [5, -3], false);
    expect(moved(r, out).sort()).toEqual([...expected].sort());
    expect(out.joints[id]).toEqual([r.joints[id][0] + 5, r.joints[id][1] - 3]);
  });
  it('alone moves only that joint', () => {
    const r = frozen();
    expect(moved(r, moveJoint(r, 'shoulder_L', [5, 5], true))).toEqual(['shoulder_L']);
  });
  it('DEPENDENTS covers every joint', () => expect(Object.keys(DEPENDENTS).sort()).toEqual([...JOINT_IDS].sort()));
});

import { mirrorArmsFrom, moveJointMirrored } from '../../../src/rig/rig-edit';

describe('mirrored arm joints', () => {
  const mirrored = (r: Rig, side: 'L' | 'R', joint: string) => {
    const other = side === 'L' ? 'R' : 'L';
    const a = r.joints[`${joint}_${side}` as JointId], b = r.joints[`${joint}_${other}` as JointId];
    expect(b[0]).toBeCloseTo(2 * r.joints.root[0] - a[0], 9);
    expect(b[1]).toBeCloseTo(a[1], 9);
  };
  const lopsided = (): Rig => moveJoint(moveJoint(DEFAULT_RIG, 'elbow_R', [30, -20], true), 'root', [7, 0], true);

  it('mirrorArmsFrom copies one arm onto the other across the root\'s vertical line', () => {
    const r = mirrorArmsFrom(lopsided(), 'L');
    for (const j of ['shoulder', 'elbow', 'wrist']) mirrored(r, 'L', j);
    expect(r.joints.neck).toEqual(lopsided().joints.neck);
  });
  it('moving a joint on either arm moves its partner to the mirror position', () => {
    const base = mirrorArmsFrom(lopsided(), 'L');
    const r = moveJointMirrored(base, 'elbow_R', [5, 3], false, true);
    expect(r.joints.elbow_R).toEqual([base.joints.elbow_R[0] + 5, base.joints.elbow_R[1] + 3]);
    for (const j of ['shoulder', 'elbow', 'wrist']) mirrored(r, 'R', j);
  });
  it('moving the root keeps the arms symmetrical; face joints are unaffected by mirroring', () => {
    const base = mirrorArmsFrom(lopsided(), 'L');
    const r = moveJointMirrored(base, 'root', [12, -4], false, true);
    for (const j of ['shoulder', 'elbow', 'wrist']) mirrored(r, 'L', j);
    expect(moveJointMirrored(base, 'eyes', [3, 3], false, true)).toEqual(moveJoint(base, 'eyes', [3, 3], false));
  });
  it('without mirroring it is just moveJoint', () => {
    expect(moveJointMirrored(DEFAULT_RIG, 'elbow_L', [3, 1], false, false)).toEqual(moveJoint(DEFAULT_RIG, 'elbow_L', [3, 1], false));
  });
});
