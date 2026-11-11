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
